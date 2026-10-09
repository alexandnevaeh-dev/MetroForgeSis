import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/index.js';

/** Shared preparation action; downloads are separate from inference and project edits. */
export function LocalImageModelPreparation({disabled=false,onBusyChange}:{disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const request=useRef<string|null>(null),mounted=useRef(true);
  const busyCallback=useRef(onBusyChange);
  busyCallback.current=onBusyChange;
  useEffect(()=>{
    mounted.current=true;
    const detach=window.metroforge?.onLocalImageModelProgress?.(data=>{
      if(mounted.current&&request.current===data.id)setStatus(`Preparing local artwork model: ${data.completed} of ${data.total} files (${data.percent}%).`);
    });
    return ()=>{mounted.current=false;detach?.();busyCallback.current?.(false);if(request.current)void window.metroforge?.cancelLocalImageModel?.(request.current);};
  },[]);
  const prepare=async()=>{
    if(request.current||disabled)return;
    if(!window.metroforge?.prepareLocalImageModel){setError('Desktop connection unavailable. Reopen the app and retry.');return;}
    const id=crypto.randomUUID();request.current=id;setBusy(true);onBusyChange?.(true);setError('');setStatus('Preparing local artwork model… Downloaded files are kept if you cancel.');
    try{
      const result=await window.metroforge.prepareLocalImageModel(id);
      if(!mounted.current||request.current!==id)return;
      if(!result.success)throw new Error(result.error||'Local model preparation failed');
      setStatus(`Local artwork model prepared (${result.fileCount??0} files). You can generate artwork now.`);
    }catch(e){if(mounted.current&&request.current===id){setStatus('');setError(e instanceof Error?e.message:'Local model preparation failed');}}
    finally{if(request.current===id)request.current=null;if(mounted.current){setBusy(false);onBusyChange?.(false);}}
  };
  const cancel=async()=>{
    if(!request.current)return;
    setStatus('Cancelling model preparation… Downloaded files will be kept.');
    try{await window.metroforge?.cancelLocalImageModel(request.current);}catch{setError('Cancellation could not be confirmed. Wait for preparation to finish or retry.');}
  };
  return <section aria-label="Local artwork model">
    <div className="row"><Button disabled={disabled||busy} aria-busy={busy} onClick={()=>void prepare()}>Prepare local artwork model</Button>
      {busy&&<Button onClick={()=>void cancel()}>Cancel model preparation</Button>}</div>
    {status&&<p className="hint" role="status">{status}</p>}{error&&<p className="hint" role="alert">{error}</p>}
  </section>;
}
