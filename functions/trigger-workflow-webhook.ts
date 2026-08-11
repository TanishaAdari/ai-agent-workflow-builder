import type {Request,Response} from 'express';
import {gql} from './shared';

const WORKFLOW=`query Workflow($id:uuid!){workflows_by_pk(id:$id){id org_id}}`;
const MEMBER=`query Member($orgId:uuid!,$userId:uuid!){org_members(where:{org_id:{_eq:$orgId},user_id:{_eq:$userId}},limit:1){role}}`;

export default async function handler(req:Request,res:Response){
  try{
    const workflowId=req.body?.input?.workflow_id||req.body?.workflow_id||req.query.workflow_id;
    const secret=req.headers['x-webhook-secret'];
    if(!secret||secret!==process.env.NHOST_WEBHOOK_SECRET)return res.status(401).json({message:'Invalid webhook secret'});
    if(!workflowId)return res.status(400).json({message:'workflow_id is required'});
    const workflow=(await gql<any>(WORKFLOW,{id:workflowId})).workflows_by_pk;
    if(!workflow)return res.status(404).json({message:'Workflow not found'});
    const owner=(await gql<any>(`query Owner($orgId:uuid!){org_members(where:{org_id:{_eq:$orgId},role:{_eq:"owner"}},limit:1){user_id}}`,{orgId:workflow.org_id})).org_members?.[0];
    if(!owner)return res.status(400).json({message:'Workflow organization has no owner'});
    const trigger=await fetch(`${process.env.NHOST_FUNCTIONS_URL}/trigger-workflow-run`,{method:'POST',headers:{'content-type':'application/json','x-hasura-admin-secret':process.env.NHOST_ADMIN_SECRET!},body:JSON.stringify({input:{workflow_id:workflowId,payload:req.body?.payload||{}},session_variables:{'x-hasura-user-id':owner.user_id}})});
    const body=await trigger.json();
    return res.status(trigger.status).json(body);
  }catch(error:any){return res.status(500).json({message:error.message});}
}
