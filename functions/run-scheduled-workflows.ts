import type {Request,Response} from 'express';
import {gql} from './shared';

const TRIGGERS=`query Scheduled{workflow_triggers(where:{type:{_eq:"scheduled"}}){id workflow_id config last_fired_at workflow{org_id}}}`;
const OWNER=`query Owner($orgId:uuid!){org_members(where:{org_id:{_eq:$orgId},role:{_eq:"owner"}},limit:1){user_id}}`;
const UPDATE=`mutation Update($id:uuid!,$time:timestamptz!){update_workflow_triggers_by_pk(pk_columns:{id:$id},_set:{last_fired_at:$time}){id}}`;

export default async function handler(_req:Request,res:Response){
  try{
    const now=Date.now();
    const triggers=(await gql<any>(TRIGGERS)).workflow_triggers||[];
    let started=0;
    for(const trigger of triggers){
      const interval=Number(trigger.config?.interval_minutes||60)*60000;
      if(trigger.last_fired_at&&now-new Date(trigger.last_fired_at).getTime()<interval)continue;
      const owner=(await gql<any>(OWNER,{orgId:trigger.workflow.org_id})).org_members?.[0];
      if(!owner)continue;
      await fetch(`${process.env.NHOST_FUNCTIONS_URL}/trigger-workflow-run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{workflow_id:trigger.workflow_id,payload:{source:'scheduled'}},session_variables:{'x-hasura-user-id':owner.user_id}})});
      await gql(UPDATE,{id:trigger.id,time:new Date().toISOString()});
      started++;
    }
    res.json({started});
  }catch(error:any){res.status(500).json({message:error.message});}
}
