<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 HeyPointer -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { HeyPointerAssistant } from '@heypointerhq/vue';
import { categories, initialRecords, nextId, type RecordRow } from './records';

// The guide's API address comes from ?api= (or VITE_HEYPOINTER_API), so any server can be tried.
const api = new URLSearchParams(location.search).get('api') ?? import.meta.env.VITE_HEYPOINTER_API ?? 'http://localhost:8791';
// The client id from `heypointer init` (publishable, not a secret): ?client= or VITE_HEYPOINTER_CLIENT_ID.
const clientId = new URLSearchParams(location.search).get('client') ?? import.meta.env.VITE_HEYPOINTER_CLIENT_ID ?? '';

const records = ref<RecordRow[]>(initialRecords());
const hash = ref(location.hash);
const notice = ref('');
const dialog = ref<HTMLDialogElement | null>(null);
const form = ref<HTMLFormElement | null>(null);
const title = ref('');
const category = ref(categories[0]!);
const owner = ref('');
const notes = ref('');

const onHash = () => { hash.value = location.hash; };
onMounted(() => addEventListener('hashchange', onHash));
onBeforeUnmount(() => removeEventListener('hashchange', onHash));

function save() {
  if (!form.value?.reportValidity()) return;
  records.value.push({ id: nextId(records.value), title: title.value, category: category.value, owner: owner.value });
  dialog.value?.close();
  notice.value = `Record saved: ${title.value}`; // rendered as text by Vue: user input is never parsed as HTML
  title.value = owner.value = notes.value = '';
  category.value = categories[0]!;
}
</script>

<template>
  <div class="shell">
    <aside class="side">
      <h1>Ledger</h1>
      <nav aria-label="Sections">
        <a href="#/records" aria-current="page">Records</a>
        <a href="#/archive">Archive</a>
      </nav>
    </aside>
    <main id="app" class="content">
      <template v-if="hash === '#/archive'">
        <h2>Archive</h2>
        <p>No archived records.</p>
      </template>
      <template v-else>
        <div class="toolbar">
          <h2>Records</h2>
          <button class="primary" id="new-record" data-heypointer-id="new-record" @click="dialog?.show()">New record</button>
        </div>
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Owner</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in records" :key="r.id">
              <td>{{ r.title }}</td><td>{{ r.category }}</td><td>{{ r.owner }}</td>
              <td class="row-actions"><button type="button" :data-edit="r.id">Edit</button><button type="button" :data-archive="r.id">Archive</button></td>
            </tr>
          </tbody>
        </table>
        <div id="notice" role="status"><div v-if="notice" class="notice">{{ notice }}</div></div>
        <dialog id="record-dialog" ref="dialog" aria-labelledby="record-title">
          <form id="record-form" ref="form" method="dialog" @submit.prevent="save">
            <h3 id="record-title">New record</h3>
            <div class="field"><label for="rec-title">Title</label><input id="rec-title" v-model="title" required /></div>
            <div class="field"><label for="rec-category">Category</label>
              <select id="rec-category" v-model="category"><option v-for="c in categories" :key="c">{{ c }}</option></select></div>
            <div class="field"><label for="rec-owner">Owner</label><input id="rec-owner" v-model="owner" required /></div>
            <div class="field"><label for="rec-notes">Notes</label><textarea id="rec-notes" v-model="notes" rows="3"></textarea></div>
            <button type="submit" class="primary" data-heypointer-id="save-record">Save record</button>
            <button type="button" id="rec-cancel" @click="dialog?.close()">Cancel</button>
          </form>
        </dialog>
      </template>
    </main>
  </div>
  <HeyPointerAssistant :base-url="api" :client-id="clientId" />
</template>
