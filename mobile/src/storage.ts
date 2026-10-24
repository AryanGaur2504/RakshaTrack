import * as SQLite from 'expo-sqlite';
import type {State,Point} from './safety';
let dbPromise:Promise<SQLite.SQLiteDatabase>|null=null;
const db=()=>dbPromise??=SQLite.openDatabaseAsync('rakshatrack-mobile.db').then(async d=>{
 await d.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ride_points (trip_id TEXT NOT NULL, time INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL NOT NULL, speed REAL, PRIMARY KEY (trip_id, time));");
 return d;
});
export async function saveState(s:State){const d=await db();await d.runAsync('INSERT INTO app_state(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload','current',JSON.stringify(s));}
export async function loadState():Promise<State|null>{const d=await db();const row=await d.getFirstAsync<{payload:string}>('SELECT payload FROM app_state WHERE id=?','current');return row?JSON.parse(row.payload):null;}
export async function addRidePoint(tripId:string,p:Point){const d=await db();await d.runAsync('INSERT OR IGNORE INTO ride_points(trip_id,time,lat,lng,accuracy,speed) VALUES (?,?,?,?,?,?)',tripId,p.time,p.lat,p.lng,p.accuracy,p.speed);}
export async function getRidePoints(tripId:string):Promise<Point[]>{const d=await db();return (await d.getAllAsync<Point>('SELECT lat,lng,time,accuracy,speed FROM ride_points WHERE trip_id=? ORDER BY time ASC',tripId));}
export async function clearRidePoints(tripId:string){const d=await db();await d.runAsync('DELETE FROM ride_points WHERE trip_id=?',tripId);}
