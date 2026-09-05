import type {GuidedTourBranch, GuidedTourNode, GuidedTourPlan, GuidedTourPosition, GuidedTourProgress} from '../types/guidedTour';

const earthRadius=6371000;
const radians=(degrees:number)=>degrees*Math.PI/180;
export function distanceMeters(a:GuidedTourPosition,b:Pick<GuidedTourNode,'latitude'|'longitude'>){
  const dLat=radians(b.latitude-a.latitude);const dLng=radians(b.longitude-a.longitude);
  const lat1=radians(a.latitude);const lat2=radians(b.latitude);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return Math.round(earthRadius*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));
}

export function nodesForBranch(plan:GuidedTourPlan,branch:GuidedTourBranch){
  return plan.nodes.filter(item=>item.branches.includes('default')||item.branches.includes(branch));
}

export function guidedTourProgress(plan:GuidedTourPlan,branch:GuidedTourBranch,position:GuidedTourPosition,completedIds:ReadonlySet<string>):GuidedTourProgress|null{
  const nodes=nodesForBranch(plan,branch);const currentIndex=Math.max(0,nodes.findIndex(item=>!completedIds.has(item.id)));
  const current=nodes[currentIndex];if(!current)return null;const distance=distanceMeters(position,current);
  return {current,next:nodes[currentIndex+1]??null,currentIndex,distanceMeters:distance,reached:distance<=current.trigger.enterRadiusMeters};
}

export function googleWalkingUrl(node:GuidedTourNode){return `https://www.google.com/maps/dir/?api=1&destination=${node.latitude},${node.longitude}&travelmode=walking`}
