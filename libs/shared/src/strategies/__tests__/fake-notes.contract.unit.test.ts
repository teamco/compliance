import { FakeNotesStrategy } from '../fakes/fake-notes';
import { runNotesContract } from './notes.contract.unit.test';

runNotesContract('FakeNotesStrategy', () => new FakeNotesStrategy());
