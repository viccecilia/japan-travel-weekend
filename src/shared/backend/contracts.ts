export type Account={id:string;email:string;createdAt:string};export type Session={token:string;accountId:string;expiresAt:string};
export interface AccountRepository{findByEmail(email:string):Promise<(Account&{passwordDigest:string})|null>;save(account:Account&{passwordDigest:string}):Promise<void>}
export interface SessionRepository{save(session:Session):Promise<void>;find(token:string):Promise<Session|null>;delete(token:string):Promise<void>}
export interface AuthProvider{register(email:string,password:string):Promise<{account:Account;session:Session}>;signIn(email:string,password:string):Promise<{account:Account;session:Session}>;signOut(token:string):Promise<void>;getSession(token:string):Promise<Session|null>}
export interface BackendGateway{kind:'local-development'|'unavailable-production';connected:boolean;auth:AuthProvider}
