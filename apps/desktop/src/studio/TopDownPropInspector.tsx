import { useId, useState } from 'react';
import { Button, ButtonStrip, Input, Select, InspectorSection } from './ui/index.js';

export interface TopDownEditorProp {
  id: string; image: string; x: number; y: number;
  layout: { displayScale: number; [key: string]: unknown };
  [key: string]: unknown;
}
export function TopDownPropInspector({ props, busy, onSave, onUndo, onRedo, selectedId, onSelect }: {
  props?: TopDownEditorProp[]; busy: boolean; selectedId?: string; onSelect?: (id: string) => void;
  onSave: (props: TopDownEditorProp[]) => void; onUndo: () => void; onRedo: () => void;
}) {
  const selectId = useId();
  const [localId, setId] = useState(props?.[0]?.id ?? '');
  const requestedId = selectedId ?? localId;
  const id = props?.some(prop => prop.id === requestedId) ? requestedId : props?.[0]?.id ?? '';
  const selected = props?.find(prop => prop.id === id);
  return <>
    <InspectorSection title="Room props">
      <p className="hint">Saved changes apply when you reload the area or restart preview.</p>
      {!props?.length ? <p className="hint">{props === undefined ? 'This area uses automatic prop placement. Asset placement controls are not connected yet.' : 'No props are placed in this area.'}</p> : <>
        <label htmlFor={selectId}>Selected prop</label><Select id={selectId} value={id} disabled={busy} onChange={event => { setId(event.target.value); onSelect?.(event.target.value); }}>
          {props.map(prop => <option key={prop.id} value={prop.id}>{prop.id}</option>)}
        </Select>
        {selected && <PropFields key={JSON.stringify(selected)} prop={selected} busy={busy}
          onSave={next => onSave(props.map(prop => prop.id === id ? next : prop))}
          onRemove={() => onSave(props.filter(prop => prop.id !== id))} />}
      </>}
    </InspectorSection>
    <InspectorSection title="Edit history">
      <ButtonStrip><Button size="sm" disabled={busy} onClick={onUndo}>Undo saved change</Button>
      <Button size="sm" disabled={busy} onClick={onRedo}>Redo saved change</Button></ButtonStrip>
    </InspectorSection>
  </>;
}
function PropFields({prop,busy,onSave,onRemove}:{prop:TopDownEditorProp;busy:boolean;onSave:(prop:TopDownEditorProp)=>void;onRemove:()=>void}) {
  const [x,setX]=useState(String(prop.x));const [y,setY]=useState(String(prop.y));const [scale,setScale]=useState(String(prop.layout.displayScale));
  const valid=[x,y,scale].every(value=>value.trim()!=='' && Number.isFinite(Number(value))) && Number(scale)>0 && Number(scale)<=4;
  return <form noValidate onSubmit={event=>{event.preventDefault();if(valid&&!busy)onSave({...prop,x:Number(x),y:Number(y),layout:{...prop.layout,displayScale:Number(scale)}});}}>
    <p className="hint">{prop.image.replace('res://','')}</p>
    <label>Ground X<Input type="number" step="any" value={x} disabled={busy} onChange={e=>setX(e.target.value)} /></label>
    <label>Ground Y<Input type="number" step="any" value={y} disabled={busy} onChange={e=>setY(e.target.value)} /></label>
    <label>Scale<Input type="number" min="0" max="4" step="any" value={scale} disabled={busy} onChange={e=>setScale(e.target.value)} /></label>
    {!valid && <p role="alert">Enter numeric positions and a scale greater than 0, up to 4.</p>}
    <ButtonStrip><Button type="submit" variant="primary" size="sm" disabled={busy||!valid}>Save prop</Button>
    <Button variant="danger" size="sm" disabled={busy} onClick={onRemove}>Remove prop</Button></ButtonStrip>
    <p className="hint">Removing a prop can be undone.</p>
  </form>;
}
