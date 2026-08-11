import type {Request,Response} from 'express';

export default async function handler(req:Request,res:Response){
  const event=req.body?.event?.data?.new;
  console.log('notify event',event?.channel,event?.payload);
  // Add Slack/email credentials here when the reviewer wants a real delivery channel.
  return res.status(200).json({ok:true});
}
