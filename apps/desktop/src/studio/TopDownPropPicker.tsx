import {useEffect,useId,useState} from 'react';
import {Button,Input,Select,InspectorSection} from './ui/index.js';
import type {AssetListItem} from './metroforge-api.js';
import type {TopDownEditorProp} from './TopDownPropInspector.js';
import {TopDownPropAnchorEditor} from './TopDownPropAnchorEditor.js';

export function TopDownPropPicker({projectPath,props,width,height,busy,onSave}:{projectPath:string;props?:TopDownEditorProp[];width:number;height:number;busy:boolean;onSave:(props:TopDownEditorProp[])=>void}) {
 const [assets,setAssets]=useState<AssetListItem[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[replaceAutomatic,setReplaceAutomatic]=useState(false);
 const fieldId=useId();
 const [assetRevision,setAssetRevision]=useState(0);
 const [assetNotice,setAssetNotice]=useState('');
 const [x,setX]=useState(''),[y,setY]=useState(''),[scale,setScale]=useState('');
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');setAssets([]);setReplaceAutomatic(false);
 void window.metroforge!.listAssets(projectPath).then(rows=>{if(cancelled)return;setAssets(rows);setSelected(previous=>rows.some(a=>a.id===previous)?previous:rows.find(a=>a.path.startsWith('assets/props/')&&a.path.endsWith('.png'))?.id??'');}).catch(()=>{if(!cancelled)setError('Could not load placement assets. Reopen this room to retry.');}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true};},[projectPath,assetRevision]);
 const eligible=assets.filter(asset=>asset.path.startsWith('assets/props/')&&asset.path.endsWith('.png'));const choice=eligible.find(asset=>asset.id===selected);
 useEffect(()=>{setScale(choice?.propAsset ? String(choice.propAsset.layout.displayScale) : '');},[choice]);
 const positionValid=[x,y].every(value=>value.trim()!==''&&Number.isFinite(Number(value)))&&Number(x)>=0&&Number(x)<=width&&Number(y)>=0&&Number(y)<=height;
 const scaleValid=scale.trim()!==''&&Number.isFinite(Number(scale))&&Number(scale)>0&&Number(scale)<=4;
 const blocked=busy||loading||!choice?.propAsset||!positionValid||!scaleValid||(props===undefined&&!replaceAutomatic)||(props?.length??0)>=512;
 return <InspectorSection title="Add prop">
 {loading?<p role="status">Loading placement assets…</p>:error?<p role="alert">{error}</p>:eligible.length===0?<p className="hint">No prop PNGs are registered in this project.</p>:<>
 <label htmlFor={fieldId}>Asset</label><Select id={fieldId} value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setAssetNotice('');}}>{eligible.map(asset=><option value={asset.id} key={asset.id}>{asset.id}</option>)}</Select>
 {choice?.dataUrl && <img src={choice.dataUrl} alt={`Preview of ${choice.id}`} style={{width:'100%',maxHeight:140,objectFit:'contain'}}/>}
 {choice&&<TopDownPropAnchorEditor key={choice.path} projectPath={projectPath} assetPath={choice.path} busy={busy} onSaved={()=>{setAssetNotice('Saved asset anchor. Existing room placements and artwork are unchanged.');setAssetRevision(v=>v+1);}}/>}
 {assetNotice&&<p role="status">{assetNotice}</p>}
 {choice&&!choice.propAsset&&<p className="hint">Save this asset's ground anchor before placing it.</p>}
 {props===undefined&&<label><Input type="checkbox" checked={replaceAutomatic} disabled={busy} onChange={e=>setReplaceAutomatic(e.target.checked)}/> Use authored props instead of automatic decorations</label>}
 <form noValidate onSubmit={event=>{event.preventDefault();
  if(blocked||!choice?.propAsset)return;
  const base=choice.id.replace(/[^A-Za-z0-9_-]/g,'_')||'prop';let id=base;let suffix=1;while(props?.some(prop=>prop.id===id))id=`${base}_${suffix++}`;
  onSave([...(props??[]),{id,image:choice.propAsset.image,x:Number(x),y:Number(y),layout:{...structuredClone(choice.propAsset.layout),displayScale:Number(scale)} as TopDownEditorProp['layout']}]);
 }}>
 <label htmlFor={`${fieldId}-x`}>Placement ground X</label><Input id={`${fieldId}-x`} type="number" min="0" max={width} step="any" value={x} disabled={busy} aria-invalid={x!==''&&!positionValid} aria-describedby={`${fieldId}-position`} onChange={e=>setX(e.target.value)}/>
 <label htmlFor={`${fieldId}-y`}>Placement ground Y</label><Input id={`${fieldId}-y`} type="number" min="0" max={height} step="any" value={y} disabled={busy} aria-invalid={y!==''&&!positionValid} aria-describedby={`${fieldId}-position`} onChange={e=>setY(e.target.value)}/>
 <p id={`${fieldId}-position`} className="hint">Choose a ground anchor inside this room: X 0–{width}, Y 0–{height}. Check the complete footprint and arrival paths in Play Preview.</p>
 <label htmlFor={`${fieldId}-scale`}>Placement scale</label><Input id={`${fieldId}-scale`} type="number" min="0" max="4" step="any" value={scale} disabled={busy} aria-invalid={!scaleValid} aria-describedby={`${fieldId}-scale-help`} onChange={e=>setScale(e.target.value)}/>
 <p id={`${fieldId}-scale-help`} className="hint">Scale must be greater than 0, up to 4. Source artwork and footprint settings are retained.</p>
 <Button type="button" size="sm" disabled={busy} onClick={()=>{setX(String(width/2));setY(String(height/2));}}>Use room center</Button>{' '}
 <Button type="submit" variant="primary" size="sm" disabled={blocked}>Place prop</Button>
 </form>
 <p className="hint">Placement saves only when you choose Place prop. Reload the area to see it in the game.</p>
 </>}
 {assets.some(asset=>asset.propAssetError)&&<p className="hint">Some assets have invalid placement settings and are unavailable.</p>}
 </InspectorSection>;
}
