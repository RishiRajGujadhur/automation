/** App-wide editor requests, decoupled from the components that fulfil them. */
export const CREATE_STEP_EVENT = 'tas:create-step';
export type CreateStepRequest = { keyword: string; text: string; featureFile?: string };
/** Ask the studio to create a step definition (from the feature editor lint, the step check, …). */
export const requestCreateStep = (r: CreateStepRequest) => window.dispatchEvent(new CustomEvent(CREATE_STEP_EVENT, { detail: r }));

/** File ▸ Save All: each open editor with unsaved edits saves itself. */
export const SAVE_ALL_EVENT = 'tas:save-all';
/** Files changed on disk by the studio (e.g. a rename across files): open editors reload them. Detail: file paths. */
export const FILES_CHANGED_EVENT = 'tas:files-changed';
