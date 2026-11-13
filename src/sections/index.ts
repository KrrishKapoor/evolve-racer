import './sections.css';
import { sectionFrame } from './canvas';
import { mountSees } from './sees';
import { mountNetwork } from './network';
import { mountGenetics } from './genetics';
import { mountRacingLine } from './racingline';

/** Builds the four explainer sections inside `root`. Each demo runs only while it is on screen. */
export function mountSections(root: HTMLElement): void {
  mountSees(
    sectionFrame(root, 'sees', 'Sensors', 'What a car sees.', [
      'Each car feels the walls with seven rays. A reading of 1 means open road; it falls toward 0 as a wall gets close.',
      'Those seven numbers and the car’s speed are everything it knows.',
    ]),
  );
  mountNetwork(
    sectionFrame(root, 'network', 'The driver', 'What the network does.', [
      'A small neural network turns those eight numbers into two: how hard to steer, and whether to accelerate or brake.',
      'Nobody writes its weights. Orange connections push a signal up, blue ones push it down, and thicker means stronger.',
    ]),
  );
  mountGenetics(
    sectionFrame(root, 'evolution', 'Evolution', 'Selection, crossover, mutation.', [
      'Every weight is a gene. After each generation the fittest drivers are kept, pairs of them are combined, and the offspring are slightly mutated.',
      'Repeat this a few dozen times and the population drives far better than any of its random ancestors.',
    ]),
  );
  mountRacingLine(
    sectionFrame(root, 'racing-line', 'The result', 'Why the racing line emerges.', [
      'A car can only turn so sharply at a given speed. Go into a corner too fast and it slides into the outside wall.',
      'So the fastest drivers learn to swing wide, clip the inside, and get back on the throttle early. Nobody told them to; it is simply what survives.',
    ]),
  );
}
