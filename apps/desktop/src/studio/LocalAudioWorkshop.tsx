import {useEffect,useRef,useState} from 'react';
import {Button,Input,Select,TextArea} from './ui/index.js';
import type {LocalAudioAlternative,LocalAudioRequest} from '@metroforge/generation';
import {AudioBindingEditor} from './AudioBindingEditor.js';

export function LocalAudioWorkshop({projectPath}:{projectPath:string}) {
 const [kind,setKind]=useState<LocalAudioRequest['kind']>('sfx');
 const [prompt,setPrompt]=useState('A heavy castle door opening, iron hinges creak, stone chamber reverberation, no voices or music.');
 const [duration,setDuration]=useState('3'),[seed,setSeed]=useState('42');
 const [configured,setConfigured]=useState<{musicConfigured:boolean;sfxConfigured:boolean;busy:boolean}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [result,setResult]=useState<LocalAudioAlternative|null>(null),[preview,setPreview]=useState('');
 const mounted=useRef(true),running=useRef(false);
 useEffect(()=>{mounted.current=true;const refresh=()=>{void window.metroforge?.getLocalAudioStatus?.().then(r=>{if(mounted.current)setConfigured(r);}).catch(()=>{if(mounted.current)setError('Could not read local audio setup.');});};refresh();const timer=setInterval(refresh,2000);return()=>{mounted.current=false;clearInterval(timer);};},[]);
 const generate=async()=>{
  if(running.current)return;
  const api=window.metroforge;if(!api?.generateLocalAudio){setError('Desktop audio connection is unavailable. Reopen MetroForge.');return;}
  running.current=true;setBusy(true);setError('');setResult(null);setPreview('');
  try {
   const audio=await api.generateLocalAudio(projectPath,{kind,prompt,duration:Number(duration),seed:Number(seed)});
   if(!mounted.current)return;setResult(audio);
   const playable=await api.getAudioPreview(projectPath,audio.path);
   if(mounted.current){if(!playable.dataUrl)throw Error('Audio was saved, but its preview could not be loaded.');setPreview(playable.dataUrl);}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Local audio generation failed.');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 };
 const ready=kind==='music'?configured?.musicConfigured:configured?.sfxConfigured;
 return <section className="panel form-stack" aria-label="Local audio workshop">
  <h3>Local audio</h3>
  <p className="hint">Create a sound effect or instrumental score, then listen before choosing it for your game. Each take stays with this project.</p>
  <label>Audio type<Select aria-label="Audio type" disabled={busy} value={kind} onChange={e=>{const k=e.target.value as LocalAudioRequest['kind'];setKind(k);setDuration(k==='music'?'30':'3');setPrompt(k==='music'?'Instrumental dark fantasy castle exploration, restrained strings, distant bells, slow pulse, mysterious and spacious, no vocals.':'A heavy castle door opening, iron hinges creak, stone chamber reverberation, no voices or music.');}}><option value="sfx">Sound effect · Stable Audio 3</option><option value="music">Music · ACE-Step</option></Select></label>
  <label>Describe the sound<TextArea aria-label="Audio description" disabled={busy} value={prompt} maxLength={1500} rows={3} onChange={e=>setPrompt(e.target.value)} /></label>
  <div className="row"><label>Seconds<Input aria-label="Audio seconds" disabled={busy} type="number" min={kind==='music'?10:0.25} max={kind==='music'?120:10} step={kind==='music'?1:0.25} value={duration} onChange={e=>setDuration(e.target.value)}/></label>
  <label>Seed<Input aria-label="Audio seed" disabled={busy} type="number" min={0} max={2147483647} step={1} value={seed} onChange={e=>setSeed(e.target.value)}/></label></div>
  <Button variant="primary" disabled={busy||!ready||!!configured?.busy||!prompt.trim()} aria-busy={busy} onClick={()=>void generate()}>{busy?'Generating audio…':'Generate audio alternative'}</Button>
  {!configured&&<p className="hint" role="status">Reading local audio setup…</p>}
  {configured&&!ready&&<p className="hint">This audio model needs local runtime setup before generation.</p>}
  {busy&&<p className="hint" role="status">The local model is working. Loading weights can take several minutes.</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<div><p role="status">Saved a new take · {result.duration.toFixed(1)} seconds. Awaiting audio review.</p>{preview&&<audio aria-label="Generated audio audition" controls src={preview} preload="metadata"/>}<p className="hint">{result.path}</p><AudioBindingEditor projectPath={projectPath} sourcePath={result.path}/></div>}
 </section>;
}
