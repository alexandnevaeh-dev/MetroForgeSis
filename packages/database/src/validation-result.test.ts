import {describe,it,expect} from 'vitest';
import {mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import type {SqliteDatabase} from './types.js';
import {openSqlJsDatabase} from './sqljs.js';
import {runMigrations} from './migrations.js';
import {ValidationResultRepository} from './repositories/validation-result.js';

const root='E:/MetroForgeData/Development/qa-snapshot-20261009/database-tests';
mkdirSync(root,{recursive:true});
// Vite 5's builtin resolver predates node:sqlite; load the real native driver
// through Node rather than substituting a mock database.
const openNative = async (path:string):Promise<SqliteDatabase> => {
  const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys = ON');return db;
};
for(const [name,open] of [['node',openNative],['electron-sqljs',openSqlJsDatabase]] as const) {
  describe(`Validation snapshots (${name})`,()=>{
    async function fixture() {
      const path=mkdtempSync(root+'/case-')+'/test.db',db=await open(path);runMigrations(db);
      for(const id of ['a','b'])db.prepare(`INSERT INTO projects
        (id,slug,title,description,profile,mode,seed,output_path,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,id,id,'','TINY_TEST','LOCAL_ONLY',1,'E:/test/'+id,'created','now','now');
      return {db,path,repo:new ValidationResultRepository(db)};
    }
    it('replaces the prior attempt completely and preserves other projects and failure details',async()=>{
      const {db,path,repo}=await fixture();
      repo.create({projectId:'a',gate:'runtime',passed:true,message:'old pass'});
      repo.create({projectId:'b',gate:'unrelated',passed:false,message:'preserve'});
      repo.replaceByProject('a',[
        {gate:'movement',passed:true,message:'stairs',details:{flights:3}},
        {gate:'runtime',passed:false,message:'current failure',details:{passed:256,total:428}},
      ]);
      expect(repo.listByProject('a').map(r=>[r.gate,r.passed])).toEqual([['movement',true],['runtime',false]]);
      expect(JSON.parse(repo.listByProject('a')[1]!.detailsJson)).toEqual({passed:256,total:428});
      expect(repo.listByProject('b')).toHaveLength(1);
      db.close();const reopened=await open(path);
      expect(new ValidationResultRepository(reopened).listByProject('a')).toHaveLength(2);reopened.close();
    });
    it('rolls back a failed mid-snapshot insertion without publishing a partial file',async()=>{
      const {db,path,repo}=await fixture();
      repo.create({projectId:'a',gate:'original',passed:false,message:'retained'});
      db.exec(`CREATE TRIGGER reject_gate BEFORE INSERT ON validation_results
        WHEN NEW.gate='reject' BEGIN SELECT RAISE(ABORT,'test write failure'); END`);
      const before=readFileSync(path);
      expect(()=>repo.replaceByProject('a',[{gate:'first',passed:true,message:'new'},{gate:'reject',passed:true,message:'new'}])).toThrow('test write failure');
      expect(repo.listByProject('a').map(r=>r.gate)).toEqual(['original']);
      if(name==='electron-sqljs')expect(readFileSync(path).equals(before)).toBe(true);
      db.close();const reopened=await open(path);
      expect(new ValidationResultRepository(reopened).listByProject('a').map(r=>r.gate)).toEqual(['original']);reopened.close();
    });
    it('rejects unserializable details before replacing current evidence',async()=>{
      const {db,repo}=await fixture();repo.create({projectId:'a',gate:'old',passed:false,message:'retained'});
      const details:Record<string,unknown>={};details.self=details;
      expect(()=>repo.replaceByProject('a',[{gate:'new',passed:true,message:'new',details}])).toThrow();
      expect(repo.listByProject('a')[0]!.gate).toBe('old');db.close();
    });
  });
}
