import type {Request,Response} from 'express';
import {gql} from './shared';

const STEP=`query Step($id:uuid!){step_runs_by_pk(id:$id){id status workflow_run_id workflow_step_id workflow_run{id status workflow_id workflow{org_id workflow_steps(order_by:{position:asc}){id position type config}}} workflow_step{position type}}}`;
const MEMBER=`query Member($orgId:uuid!,$userId:uuid!){org_members(where:{org_id:{_eq:$orgId},user_id:{_eq:$userId}},limit:1){role}}`;
const UPDATE_STEP=`mutation UpdateStep($id:uuid!,$changes:step_runs_set_input!){update_step_runs_by_pk(pk_columns:{id:$id},_set:$changes){id status}}`;
const UPDATE_RUN=`mutation UpdateRun($id:uuid!,$changes:workflow_runs_set_input!){update_workflow_runs_by_pk(pk_columns:{id:$id},_set:$changes){id status}}`;

export default async function handler(req:Request,res:Response){
  try{
    const id=req.body?.input?.step_run_id;
    const userId=req.body?.session_variables?.['x-hasura-user-id'];
    if(!id||!userId)return res.status(401).json({message:'Authentication required'});
    const step=(await gql<any>(STEP,{id})).step_runs_by_pk;
    if(!step||step.status!=='paused'||step.workflow_step.type!=='approval_gate')return res.status(400).json({message:'Step is not waiting for approval'});
    const orgId=step.workflow_run.workflow.org_id;
    const member=(await gql<any>(MEMBER,{orgId,userId})).org_members?.[0];
    if(!member||!['owner','editor'].includes(member.role))return res.status(403).json({message:'Only an owner or editor can approve this step'});
    await gql(UPDATE_STEP,{id,changes:{status:'approved',approved_by:userId,approved_at:new Date().toISOString()}});
    const steps=step.workflow_run.workflow.workflow_steps;
    const position=step.workflow_step.position;
    await gql(UPDATE_RUN,{id:step.workflow_run_id,changes:{status:'running'}});
    const next=steps.filter((item:any)=>item.position>position);
    if(!next.length){await gql(UPDATE_RUN,{id:step.workflow_run_id,changes:{status:'completed',finished_at:new Date().toISOString()}});return res.json({run_id:step.workflow_run_id,status:'completed'});}
    // Continue the remaining steps through the same runner.
    const module=await import('./trigger-workflow-run');
    const result=await (module as any).runSteps?.(step.workflow_run.workflow,{id:step.workflow_run_id,status:'running'},next,0);
    return res.json({run_id:step.workflow_run_id,status:result?.paused?'paused':result?.failed?'failed':'completed'});
  }catch(error:any){return res.status(500).json({message:error.message});}
}
