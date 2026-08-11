const endpoint=process.env.NHOST_GRAPHQL_URL!;
const secret=process.env.NHOST_ADMIN_SECRET!;

export async function gql<T>(query:string,variables:Record<string,unknown>={}){
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-hasura-admin-secret':secret},body:JSON.stringify({query,variables})});
  const body=await response.json();
  if(!response.ok||body.errors)throw new Error(body.errors?.[0]?.message||'GraphQL request failed');
  return body.data as T;
}

export async function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

export async function callWithRetry<T>(fn:()=>Promise<T>,retries=1){
  let lastError:any;
  for(let attempt=0;attempt<=retries;attempt++){
    try{return await fn();}catch(error){lastError=error;if(attempt<retries)await sleep(500);}
  }
  throw lastError;
}
