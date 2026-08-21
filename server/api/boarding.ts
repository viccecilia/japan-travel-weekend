import type {BoardingVerification,BoardingVerificationEndpoint} from '../../src/shared/capabilities/boarding.js';

export interface BoardingStaffAuthorizer{
  canScan(input:{accessToken:string;vehicleGroupId:string}):Promise<boolean>;
}

export async function verifyBoardingRequest(input:{accessToken:string;token:string;vehicleGroupId:string;idempotencyKey:string},dependencies:{authorizer:BoardingStaffAuthorizer;endpoint:BoardingVerificationEndpoint}):Promise<BoardingVerification>{
  if(!input.accessToken||!input.token||!input.vehicleGroupId||!input.idempotencyKey)throw new Error('登车核验请求不完整');
  if(!await dependencies.authorizer.canScan({accessToken:input.accessToken,vehicleGroupId:input.vehicleGroupId}))throw new Error('无权核验本车辆登车凭证');
  return dependencies.endpoint.verify({token:input.token,vehicleGroupId:input.vehicleGroupId,idempotencyKey:input.idempotencyKey});
}
