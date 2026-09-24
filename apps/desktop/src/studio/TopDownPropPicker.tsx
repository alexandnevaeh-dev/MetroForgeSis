import {useEffect,useId,useState} from 'react';
import {Button,Input,Select,InspectorSection} from './ui/index.js';
import type {AssetListItem} from './metroforge-api.js';
import type {TopDownEditorProp} from './TopDownPropInspector.js';

export function TopDownPropPicker({projectPath,props,width,height,busy,onSave}:{projectPath:string;props?:TopDownEditorProp[];width:number;height:number;busy:boolean;onSave:(props:TopDownEditorProp[])=>void}) {
 const [assets,setAssets]=useState<AssetListItem[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[replaceAutomatic,setReplaceAutomatic]=useState(false);
 const fieldId=useId();
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');setAssets([]);setSelected('');setReplaceAutomatic(false);
 void window.metroforge!.listAssets(projectPath).then(rows=>{if(cancelled)return;setAssets(rows);setSelected(rows.find(a=>a.propAsset)?.id??'');}).catch(()=>{if(!cancelled)setError('Could not load placement assets. Reopen this room to retry.');}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true};},[projectPath]);
 const eligible=assets.filter(asset=>asset.propAsset);const choice=eligible.find(asset=>asset.id===selected);
 const blocked=busy||loading||!choice||(props===undefined&&!replaceAutomatic)||(props?.length??0)>=512;
 return <InspectorSection title="Add prop">
 {loading?<p role="status">Loading placement assets…</p>:error?<p role="alert">{error}</p>:eligible.length===0?<p className="hint">No assets in this project have authored placement settings yet.</p>:<>
 <label htmlFor={fieldId}>Asset</label><Select id={fieldId} value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{eligible.map(asset=><option value={asset.id} key={asset.id}>{asset.id}</option>)}</Select>
 {choice?.dataUrl && <img src={choice.dataUrl} alt={`Preview of ${choice.id}`} style={{width:'100%',maxHeight:140,objectFit:'contain'}}/>}
 {props===undefined&&<label><Input type="checkbox" checked={replaceAutomatic} disabled={busy} onChange={e=>setReplaceAutomatic(e.target.checked)}/> Use authored props instead of automatic decorations</label>}
 <Button size="sm" disabled={blocked} onClick={()=>{
  if(blocked||!choice?.propAsset)return;
  const base=choice.id.replace(/[^A-Za-z0-9_-]/g,'_')||'prop';let id=base;let suffix=1;while(props?.some(prop=>prop.id===id))id=`${base}_${suffix++}`;
  onSave([...(props??[]),{id,image:choice.propAsset.image,x:width/2,y:height/2,layout:structuredClone(choice.propAsset.layout) as TopDownEditorProp['layout']}]);
 }}>Place in room center</Button>
 <p className="hint">Then set its position in the inspector. Saved changes require an area reload.</p>
 </>}
 {assets.some(asset=>asset.propAssetError)&&<p className="hint">Some assets have invalid placement settings and are unavailable.</p>}
 </InspectorSection>;
}
