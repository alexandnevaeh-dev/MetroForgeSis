/** Mirrors OverworldManager terrain selection. Native parity receipts cover signed 64-bit hashing. */
export type TerrainRoles = Record<string, readonly [number, number]>;
const variants = ['ground_grate','ground_cable','ground_hazard','ground_stain','ground_dirty'];
export function terrainCellHash(areaId:string,x:number,y:number,modulo:number):number {
  let id=5381n;
  for(const char of areaId) id=BigInt.asUintN(32,id*33n+BigInt(char.codePointAt(0)!));
  let h=BigInt.asIntN(64,BigInt(x)*374761393n+BigInt(y)*668265263n+id);
  h=BigInt.asIntN(64,(h^(h>>13n))*1274126177n);
  h=BigInt.asIntN(64,h^(h>>16n));
  const m=BigInt(modulo);return Number(((h%m)+m)%m);
}
export function terrainRole(areaId:string,value:number,x:number,y:number,roles:TerrainRoles):string {
  const hash=(m:number)=>terrainCellHash(areaId,x,y,m);
  const available=variants.filter(role=>Object.hasOwn(roles,role));
  if(value===3)return Object.hasOwn(roles,'wall_accent')&&hash(7)===0?'wall_accent':'wall';
  if(value===2)return 'hazard';
  if(value===1){
    if(!Object.hasOwn(roles,'ground_wear'))return 'ground';
    const roll=hash(15);if(roll<10)return 'ground';if(roll<13)return 'ground_wear';
    return available.length?available[hash(13)%available.length]!:'ground';
  }
  return available.length&&hash(15)===0?available[hash(13)%available.length]!:'ground';
}
export function terrainAtlasCell(areaId:string,value:number,x:number,y:number,roles:TerrainRoles):readonly[number,number]{
  return roles[terrainRole(areaId,value,x,y,roles)]??roles.ground??[0,0];
}
