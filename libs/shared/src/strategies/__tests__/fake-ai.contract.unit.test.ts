import { FakeAiStrategy } from '../fakes/fake-ai';
import { runAiContract } from './ai.contract.unit.test';

runAiContract('FakeAiStrategy', () => new FakeAiStrategy());
