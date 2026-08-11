'use client';

import {useEffect,useState} from 'react';
import {useAuth} from '../components/AuthProvider';
import {request} from '../lib/graphql';
import {createClient as createWsClient} from 'graphql-ws';

const WORKFLOWS=`query Workflows{workflows(order_by:{created_at:desc}){id name description org_id workflow_steps(order_by:{position:asc}){id position type config} workflow_triggers{id type config} workflow_runs(order_by:{created_at:desc},limit:1){id status started_at finished_at}}}`;
const MY_ORGS=`query MyOrgs{org_members{org_id role organization{id name calls_used calls_allowed calls_period_start}}}`;
const CREATE_WORKFLOW=`mutation CreateWorkflow($workflow:workflows_insert_input!){insert_workflows_one(object:$workflow){id}}`;
const ADD_STEP=`mutation AddStep($step:workflow_steps_insert_input!){insert_workflow_steps_one(object:$step){id}}`;
const ADD_TRIGGER=`mutation AddTrigger($trigger:workflow_triggers_insert_input!){insert_workflow_triggers_one(object:$trigger){id}}`;
const UPDATE_STEP_POSITION=`mutation MoveStep($id:uuid!,$position:Int!){update_workflow_steps_by_pk(pk_columns:{id:$id},_set:{position:$position}){id position}}`;
const RUN=`mutation Run($workflowId:uuid!){triggerWorkflowRun(workflow_id:$workflowId){run_id status}}`;
const APPROVE=`mutation Approve($stepRunId:uuid!){approveStep(step_run_id:$stepRunId){run_id status}}`;

export default function Home(){
  const {nhost,user,loading}=useAuth();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [orgs,setOrgs]=useState<any[]>([]);
  const [workflows,setWorkflows]=useState<any[]>([]);
  const [selectedOrg,setSelectedOrg]=useState('');
  const [selectedWorkflow,setSelectedWorkflow]=useState<any>(null);
  const [newName,setNewName]=useState('Demo AI Workflow');
  const [newStep,setNewStep]=useState('llm_call');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [stepRuns,setStepRuns]=useState<any[]>([]);

  async function refresh(){
    if(!user)return;
    try{
      const orgData=await request<any>(nhost,MY_ORGS);
      const workflowData=await request<any>(nhost,WORKFLOWS);
      setOrgs(orgData.org_members||[]);
      const nextWorkflows=workflowData.workflows||[];setWorkflows(nextWorkflows);if(selectedWorkflow){const next=nextWorkflows.find((item:any)=>item.id===selectedWorkflow.id);if(next)setSelectedWorkflow(next);}
      if(!selectedOrg&&orgData.org_members?.[0])setSelectedOrg(orgData.org_members[0].org_id);
    }catch(error:any){setMessage(error.message);}
  }

  useEffect(()=>{refresh();},[user]);

  useEffect(()=>{
    setStepRuns([]);
    const session=nhost.getUserSession();
    if(!selectedWorkflow||!selectedWorkflow.workflow_runs?.[0]?.id||!session?.accessToken)return;
    const wsUrl=nhost.graphql.url.replace(/^http/,'ws');
    const ws=createWsClient({url:wsUrl,connectionParams:{headers:{Authorization:`Bearer ${session?.accessToken}`}}});
    const dispose=ws.subscribe({query:`subscription StepRuns($runId:uuid!){step_runs(where:{workflow_run_id:{_eq:$runId}},order_by:{created_at:asc}){id status input output error attempt_count approved_by approved_at workflow_step{position type}}}`,variables:{runId:selectedWorkflow.workflow_runs?.[0]?.id}}, {next:data=>setStepRuns((data as any).data.step_runs),error:()=>{},complete:()=>{}});
    return()=>{dispose();ws.dispose();};
  },[selectedWorkflow]);

  async function signIn(){
    setMessage('');
    try{
      await nhost.auth.signInEmailPassword({email,password});
    }catch(error:any){
      setMessage(error.message);
    }
  }

  async function signUp(){
    setMessage('');
    try{
      await nhost.auth.signUpEmailPassword({email,password});
      setMessage('Account created. Check email verification if enabled.');
    }catch(error:any){
      setMessage(error.message);
    }
  }

  async function signOut(){
    const session=nhost.getUserSession();
    if(session?.refreshToken)await nhost.auth.signOut({refreshToken:session.refreshToken});
    setWorkflows([]);
    setOrgs([]);
  }

  async function createWorkflow(){
    if(!selectedOrg)return;
    setBusy(true);setMessage('');
    try{
      const data=await request<any>(nhost,CREATE_WORKFLOW,{workflow:{org_id:selectedOrg,name:newName,description:'LLM → HTTP → branch → approval'}});
      const workflowId=data.insert_workflows_one.id;
      const steps=[
        {workflow_id:workflowId,position:1,type:'llm_call',config:{prompt:'Answer with exactly one word: APPROVE or REJECT. Say APPROVE.',model:'llama-3.1-8b-instant'}},
        {workflow_id:workflowId,position:2,type:'http_request',config:{url:'https://httpbin.org/post',method:'POST',body:{source:'agentflow',message:'hello'}}},
        {workflow_id:workflowId,position:3,type:'conditional_branch',config:{field:'previous.output',equals:'APPROVE',then:'approval',else:'finish'}},
        {workflow_id:workflowId,position:4,type:'approval_gate',config:{message:'Owner or editor approval required.'}}
      ];
      for(const step of steps)await request(nhost,ADD_STEP,{step});
      await request(nhost,ADD_TRIGGER,{trigger:{workflow_id:workflowId,type:'webhook',config:{}}});
      setMessage('Workflow created.');await refresh();
    }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  async function addStep(){
    if(!selectedWorkflow)return;
    setBusy(true);setMessage('');
    try{
      const position=selectedWorkflow.workflow_steps.length+1;
      await request(nhost,ADD_STEP,{step:{workflow_id:selectedWorkflow.id,position,type:newStep,config:stepConfig(newStep)}});
      await refresh();
    }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  async function moveStep(step:any,direction:number){
    if(!selectedWorkflow)return;
    const steps=[...selectedWorkflow.workflow_steps].sort((a:any,b:any)=>a.position-b.position);
    const index=steps.findIndex((item:any)=>item.id===step.id);
    const target=index+direction;
    if(target<0||target>=steps.length)return;
    setBusy(true);setMessage('');
    try{
      await request(nhost,UPDATE_STEP_POSITION,{id:step.id,position:10000});
      await request(nhost,UPDATE_STEP_POSITION,{id:steps[target].id,position:step.position});
      await request(nhost,UPDATE_STEP_POSITION,{id:step.id,position:steps[target].position});
      await refresh();
    }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  async function addTrigger(type:string){
    if(!selectedWorkflow||!type)return;
    setBusy(true);setMessage('');
    try{await request(nhost,ADD_TRIGGER,{trigger:{workflow_id:selectedWorkflow.id,type,config:type==='scheduled'?{interval_minutes:60}:type==='database_event'?{event_type:'row_changed'}:{}}});await refresh();}catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  function stepConfig(type:string){
    if(type==='llm_call')return {prompt:'Respond briefly.'};
    if(type==='http_request')return {url:'https://httpbin.org/get',method:'GET'};
    if(type==='conditional_branch')return {equals:'APPROVE',then:'continue',else:'skip'};
    if(type==='approval_gate')return {message:'Approval required.'};
    if(type==='db_write')return {table:'workflow_outputs'};
    if(type==='notify')return {channel:'email',message:'Workflow notification'};
    return {};
  }

  async function runWorkflow(){
    if(!selectedWorkflow)return;
    setBusy(true);setMessage('');
    try{await request(nhost,RUN,{workflowId:selectedWorkflow.id});setMessage('Run started.');await refresh();}catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  async function approve(stepRunId:string){
    setBusy(true);setMessage('');
    try{await request(nhost,APPROVE,{stepRunId});setMessage('Step approved.');await refresh();}catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }

  if(loading)return <main className="center">Loading...</main>;
  if(!user)return <main className="auth"><section className="card auth-card"><div className="brand">AgentFlow</div><h1>Build AI workflows.</h1><p>Sign in to your Nhost account to manage organization workflows.</p><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><div className="actions"><button onClick={signIn}>Sign in</button><button className="secondary" onClick={signUp}>Create account</button></div>{message&&<p className="message">{message}</p>}</section></main>;

  const currentOrg=orgs.find(item=>item.org_id===selectedOrg);
  const visibleWorkflows=workflows.filter(item=>item.org_id===selectedOrg);
  const canRun=currentOrg?.role==='owner'||currentOrg?.role==='editor';

  return <main className="shell">
    <header><div><div className="brand">AgentFlow</div><span className="muted">AI Agent Workflow Builder</span></div><button className="secondary" onClick={signOut}>Sign out</button></header>
    <section className="toolbar card"><div><label>Organization</label><select value={selectedOrg} onChange={e=>{setSelectedOrg(e.target.value);setSelectedWorkflow(null);}}>{orgs.map(org=><option key={org.org_id} value={org.org_id}>{org.organization.name} · {org.role}</option>)}</select></div><div className="quota"><span>Usage</span><strong>{currentOrg?.organization.calls_used||0} / {currentOrg?.organization.calls_allowed||0}</strong></div></section>
    <div className="grid">
      <section className="card"><div className="section-title"><div><h2>Workflows</h2><p>Only workflows in your selected organization are returned.</p></div></div>{visibleWorkflows.map(workflow=><button className={`workflow ${selectedWorkflow?.id===workflow.id?'selected':''}`} key={workflow.id} onClick={()=>setSelectedWorkflow(workflow)}><span>{workflow.name}</span><small>{workflow.workflow_steps.length} steps · {workflow.workflow_runs?.[0]?.status||'never run'}</small></button>)}{!visibleWorkflows.length&&<p className="muted">No workflows yet.</p>}</section>
      <section className="card"><h2>Build workflow</h2><p>Create a demo or add individual steps to the selected workflow.</p><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Workflow name"/><button disabled={busy||!currentOrg||(currentOrg.role!=='owner'&&currentOrg.role!=='editor')} onClick={createWorkflow}>Create demo workflow</button>{selectedWorkflow&&<><div className="builder-row"><select value={newStep} onChange={e=>setNewStep(e.target.value)}><option value="llm_call">llm_call</option><option value="http_request">http_request</option><option value="conditional_branch">conditional_branch</option><option value="approval_gate">approval_gate</option><option value="db_write">db_write</option><option value="notify">notify</option></select><button disabled={busy} onClick={addStep}>Add step</button></div><div className="builder-row"><select defaultValue="" onChange={e=>{if(e.target.value)addTrigger(e.target.value)}}><option value="">Attach trigger</option><option value="manual">manual</option><option value="webhook">webhook</option><option value="scheduled">scheduled</option><option value="database_event">database_event</option></select></div></>}<p className="muted">Sensitive steps such as db_write, notify and webhook are owner-only. Hasura enforces that rule too.</p></section>
    </div>
    {selectedWorkflow&&<section className="card run-panel"><div className="run-head"><div><h2>{selectedWorkflow.name}</h2><p>{selectedWorkflow.description}</p></div>{canRun&&<button disabled={busy} onClick={runWorkflow}>Run workflow</button>}</div><div className="steps">{selectedWorkflow.workflow_steps.map((step:any,index:number)=><div className="step" key={step.id}><span>{step.position}</span><div><strong>{step.type}</strong><p>{step.config?.prompt||step.config?.message||step.config?.url||'Configured step'}</p></div><div className="step-actions"><button className="secondary" disabled={index===0||busy} onClick={()=>moveStep(step,-1)}>↑</button><button className="secondary" disabled={index===selectedWorkflow.workflow_steps.length-1||busy} onClick={()=>moveStep(step,1)}>↓</button></div></div>)}</div>{stepRuns.length>0&&<div className="live"><h3>Live run</h3>{stepRuns.map(run=><div className="live-row" key={run.id}><div><strong>Step {run.workflow_step.position}: {run.workflow_step.type}</strong><span className={`status ${run.status}`}>{run.status}</span></div>{run.status==='paused'&&canRun&&<button onClick={()=>approve(run.id)}>Approve</button>}<small>{run.error||JSON.stringify(run.output||'')}</small></div>)}</div>}</section>}
    {message&&<div className="toast">{message}</div>}
  </main>;
}