import type {Request,Response} from 'express';
import {gql} from './shared';

const TRIGGERS=`query Triggers($eventType:String!){workflow_triggers(where:{type:{_eq:"database_event"},config:{_contains:{event_type:$eventType}}}){workflow_id workflow{org_id}}}`;
const OWNER=`query Owner($orgId:uuid!){org_members(where:{org_id:{_eq:$orgId},role:{_eq:"owner"}},limit:1){user_id}}`;

export default async function handler(req:Request,res:Response){
  try{
    const event=req.body?.event?.data?.new||{};
    const eventType=event.event_type||'row_changed';
    const triggers=(await gql<any>(TRIGGERS,{eventType})).workflow_triggers||[];
    for(const trigger of triggers){
      const owner=(await gql<any>(OWNER,{orgId:trigger.workflow.org_id})).org_members?.[0];
      if(!owner)continue;
      await fetch(`${process.env.NHOST_FUNCTIONS_URL}/trigger-workflow-run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{workflow_id:trigger.workflow_id,payload:event},session_variables:{'x-hasura-user-id':owner.user_id}})});
    }
    res.json({ok:true});
  }catch(error:any){res.status(500).json({message:error.message});}
}
