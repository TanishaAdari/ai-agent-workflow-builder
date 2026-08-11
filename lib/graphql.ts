import type {NhostClient} from '@nhost/nhost-js';

export async function request<T>(nhost:NhostClient,query:string,variables?:Record<string,unknown>){
  const response=await nhost.graphql.request<T>({query,variables});
  return response.body.data as T;
}
