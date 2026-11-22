// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
/** A records register. Repeated "Edit"/"Archive" row buttons are intentional: they test ambiguity. */
export interface RecordRow { id: string; title: string; category: string; owner: string }

export const initialRecords = (): RecordRow[] => [
  { id: 'r1', title: 'Q1 invoice', category: 'Finance', owner: 'Ada' },
  { id: 'r2', title: 'Hiring plan', category: 'People', owner: 'Ben' },
];

export const categories = ['Finance', 'People', 'Legal'];

export function nextId(records: RecordRow[]): string {
  return `r${records.length + 1}`;
}
