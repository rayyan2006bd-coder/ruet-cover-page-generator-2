import { atom } from 'jotai';
import { Prompt } from './Prompt';

export const isInAppAtom = atom<boolean>(false);
export const updatePrompt = new Prompt();
