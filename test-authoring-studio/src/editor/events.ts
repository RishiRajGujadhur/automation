/** App-wide editor requests, decoupled from the components that fulfil them. */
export const CREATE_STEP_EVENT = 'tas:create-step';
export type CreateStepRequest = { keyword: string; text: string; featureFile?: string };
/** Ask the studio to create a step definition (from the feature editor lint, the step check, …). */
export const requestCreateStep = (r: CreateStepRequest) => window.dispatchEvent(new CustomEvent(CREATE_STEP_EVENT, { detail: r }));
