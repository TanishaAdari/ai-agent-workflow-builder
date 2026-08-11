import type {Request,Response} from 'express';
import {gql} from './shared';

export default async function handler(_req:Request,res:Response){
  try{
    await gql(`mutation Reset{update_organizations(where:{calls_period_start:{_lt:"${new Date().toISOString().slice(0,10)}"}},_set:{calls_used:0,calls_period_start:"${new Date().toISOString().slice(0,7)}-01"}){affected_rows}}`);
    res.json({ok:true});
  }catch(error:any){res.status(500).json({message:error.message});}
}
