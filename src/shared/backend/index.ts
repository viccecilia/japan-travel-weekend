import {runtimeMode} from '../config/businessRules';import {createLocalBackend,unavailableProductionBackend} from './localBackend';
export const backend=runtimeMode==='production'?unavailableProductionBackend:createLocalBackend();
