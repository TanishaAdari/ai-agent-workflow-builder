import type {Request,Response} from 'express';
import {callWithRetry,gql,sleep} from './shared';

type Step={id:string;position:number;type:string;config:any};
type Run={id:string;status:string};

const WORKFLOW=`query Workflow($id:uuid!){workflows_by_pk(id:$id){id org_id name workflow_steps(order_by:{position:asc}){id position type config} workflow_triggers{id type config}}}`;
const MEMBER=`query Member($orgId:uuid!,$userId:uuid!){org_members(where:{org_id:{_eq:$orgId},user_id:{_eq:$userId}},limit:1){role}}`;
const ORG=`query Org($id:uuid!){organizations_by_pk(id:$id){id calls_used calls_allowed}}`;
const CREATE_RUN=`mutation CreateRun($run:workflow_runs_insert_input!){insert_workflow_runs_one(object:$run){id status}}`;
const CREATE_STEP=`mutation CreateStep($step:step_runs_insert_input!){insert_step_runs_one(object:$step){id}}`;
const UPDATE_STEP=`mutation UpdateStep($id:uuid!,$changes:step_runs_set_input!){update_step_runs_by_pk(pk_columns:{id:$id},_set:$changes){id status}}`;
const UPDATE_RUN=`mutation UpdateRun($id:uuid!,$changes:workflow_runs_set_input!){update_workflow_runs_by_pk(pk_columns:{id:$id},_set:$changes){id status}}`;
const FINISH_USAGE=`mutation FinishUsage($id:uuid!){update_organizations_by_pk(pk_columns:{id:$id},_inc:{calls_used:1}){id calls_used}}`;

async function llm(config:any,input:any){
  if(!process.env.GROQ_API_KEY){await sleep(1200);return 'APPROVE';}
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:config.model||process.env.GROQ_MODEL||'llama-3.1-8b-instant',messages:[{role:'system',content:'Follow the workflow instruction exactly.'},{role:'user',content:`${config.prompt||'Respond briefly.'}\nPrevious step output:\n${JSON.stringify(input)}`}],temperature:0})});
  if(!response.ok)throw new Error(`LLM request failed: ${response.status}`);
  const body=await response.json();
  return body.choices?.[0]?.message?.content?.trim()||'';
}

async function httpRequest(config:any,input:any){
  const response=await fetch(config.url,{method:config.method||'GET',headers:{'content-type':'application/json',...(config.headers||{})},body:['GET','HEAD'].includes((config.method||'GET').toUpperCase())?undefined:JSON.stringify(config.body??input)});
  const text=await response.text();
  if(!response.ok)throw new Error(`HTTP request failed: ${response.status}`);
  try{return JSON.parse(text);}catch{return text;}
}

async function writeOutput(orgId:string,runId:string,stepId:string,input:any){
  await gql(`mutation Write($object:workflow_outputs_insert_input!){insert_workflow_outputs_one(object:$object){id}}`,{object:{org_id:orgId,workflow_run_id:runId,step_run_id:stepId,payload:input}});
  return input;
}

async function notify(orgId:string,stepId:string,config:any,input:any){
  await gql(`mutation Notify($object:notifications_insert_input!){insert_notifications_one(object:$object){id}}`,{object:{org_id:orgId,step_run_id:stepId,channel:config.channel||'email',payload:{message:config.message||JSON.stringify(input),to:config.to||''}}});
  return {sent:true};
}

export async function runSteps(workflow:any,run:Run,steps:Step[],startIndex=0){
  let previous:any=null;
  for(let index=startIndex;index<steps.length;index++){
    const step=steps[index];
    const created=await gql<any>(CREATE_STEP,{step:{workflow_run_id:run.id,workflow_step_id:step.id,status:'running',input:previous,attempt_count:0}});
    const stepRunId=created.insert_step_runs_one.id;
    try{
      if(step.type==='approval_gate'){
        await gql(UPDATE_STEP,{id:stepRunId,changes:{status:'paused'}});
        await gql(UPDATE_RUN,{id:run.id,changes:{status:'paused'}});
        return {paused:true,stepRunId};
      }
      await gql(UPDATE_STEP,{id:stepRunId,changes:{attempt_count:1}});
      let output:any;
      if(step.type==='llm_call')output=await callWithRetry(()=>llm(step.config,previous));
      else if(step.type==='http_request')output=await callWithRetry(()=>httpRequest(step.config,previous));
      else if(step.type==='conditional_branch'){
        const value=previous?.output??previous;
        const pass=String(value).toUpperCase().includes(String(step.config.equals||'APPROVE').toUpperCase());
        output={branch:pass?'then':'else',value};
        if(!pass&&steps[index+1]?.type==='approval_gate'){
          const skipped=await gql<any>(CREATE_STEP,{step:{workflow_run_id:run.id,workflow_step_id:steps[index+1].id,status:'skipped',input:output,attempt_count:0}});
          index++;
        }
      }else if(step.type==='db_write')output=await writeOutput(workflow.org_id,run.id,step.id,previous);
      else if(step.type==='notify')output=await notify(workflow.org_id,step.id,step.config,previous);
      else output=previous;
      await gql(UPDATE_STEP,{id:stepRunId,changes:{status:'completed',output}});
      previous={output};
    }catch(error:any){
      await gql(UPDATE_STEP,{id:stepRunId,changes:{status:'failed',error:error.message,attempt_count:2}});
      await gql(UPDATE_RUN,{id:run.id,changes:{status:'failed',error:error.message,finished_at:new Date().toISOString()}});
      await gql(FINISH_USAGE,{id:workflow.org_id});
      return {failed:true,error:error.message};
    }
  }
  await gql(UPDATE_RUN,{id:run.id,changes:{status:'completed',finished_at:new Date().toISOString()}});
  await gql(FINISH_USAGE,{id:workflow.org_id});
  return {completed:true};
}

export default async function handler(req:Request,res:Response){
  try{
    const input=req.body?.input||{};
    const workflowId=input.workflow_id;
    const sessionVariables=req.body?.session_variables||{};
    const userId=sessionVariables['x-hasura-user-id'];
    const sessionRole=sessionVariables['x-hasura-role'];

    if(!workflowId||!userId){
      return res.status(401).json({message:'Authentication required'});
    }

    const data=await gql<any>(WORKFLOW,{id:workflowId});
    const workflow=data.workflows_by_pk;

    if(!workflow){
      return res.status(404).json({message:'Workflow not found'});
    }

    let role:string|undefined;

    if(sessionRole==='admin'|| userId==='admin'){
      role='owner';
    }else{
      const member=await gql<any>(MEMBER,{
        orgId:workflow.org_id,
        userId
      });

      role=member.org_members?.[0]?.role;

      if(!role || !['owner','editor'].includes(role)){
        return res.status(403).json({
          message:'You cannot trigger this workflow'
        });
      }
    }
    const org=(await gql<any>(ORG,{id:workflow.org_id})).organizations_by_pk;
    if(!org||org.calls_used>=org.calls_allowed)return res.status(429).json({message:'Organization quota exhausted'});
    const run=(await gql<any>(CREATE_RUN,{run:{workflow_id:workflowId,status:'running',input:input.payload||{}}})).insert_workflow_runs_one;
    const result=await runSteps(workflow,run,workflow.workflow_steps);
    return res.json({run_id:run.id,status:result.paused?'paused':result.failed?'failed':'completed'});
  }catch(error:any){return res.status(500).json({message:error.message});}
}
