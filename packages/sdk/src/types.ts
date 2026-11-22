// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
// Type-only re-export of the shared contracts. No runtime import, so zod never enters the SDK bundle.
// Contract source: packages/contracts.
import type { Evidence, FlowSuggestion, StepAction, Target, Walkthrough, WalkthroughStep } from '@heypointerhq/contracts';

export type { Evidence, FlowSuggestion, StepAction, Target, Walkthrough, WalkthroughStep };
export type { HealthResponse, ErrorResponse, TranscribeResponse } from '@heypointerhq/contracts';

/** SDK-local alias: the target shape a step carries. */
export type StepTarget = Target;
