'use client';

import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {createClient,type NhostClient} from '@nhost/nhost-js';

const nhost=createClient({
  subdomain:process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN||'local',
  region:process.env.NEXT_PUBLIC_NHOST_REGION||'local'
});

type AuthContext={
  nhost:NhostClient;
  user:any;
  loading:boolean;
};

const Context=createContext<AuthContext>({
  nhost,
  user:null,
  loading:true
});

export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<any>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const session=nhost.getUserSession();
    setUser(session?.user||null);
    setLoading(false);

    return nhost.sessionStorage.onChange(session=>{
      setUser(session?.user||null);
    });
  },[]);

  const value=useMemo(()=>({nhost,user,loading}),[user,loading]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAuth=()=>useContext(Context);
