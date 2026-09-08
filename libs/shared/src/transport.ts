// Implementation lives in @idevconn/nestjs-resilience (adds redis support on
// top of what this repo used to hand-roll); re-exported so every consumer
// keeps importing from @icore/shared.
export { buildTransport, buildTransportMS } from '@idevconn/nestjs-resilience';
