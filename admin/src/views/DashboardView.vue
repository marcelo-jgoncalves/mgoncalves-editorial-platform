<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { postsApi, categoriesApi } from '../services/api'
import { useToast } from '../composables/useToast'
import type { Post } from '../types'

type PostListItem = Pick<Post,
  'slug' | 'titulo' | 'status' | 'data_atualizacao' | 'autor_id' | 'categoria_slug' |
  'imagem_destaque_url' | 'e_popular' | 'e_projeto' | 'tempo_leitura_min' | 'data_publicacao' | 'version'
>

const THUMB_GRADIENTS = [
  'linear-gradient(150deg,#0F4C5C 0%,#08323D 100%)',
  'linear-gradient(150deg,#5B8B96 0%,#0F4C5C 100%)',
  'linear-gradient(150deg,#C9603C 0%,#A94C2D 100%)'
]

const STATUS_TABS: Array<{ key: string; label: string; value: string | null }> = [
  { key: 'todos', label: 'Todos', value: null },
  { key: 'publicado', label: 'Publicado', value: 'Publicado' },
  { key: 'rascunho', label: 'Rascunho', value: 'Rascunho' },
  { key: 'programado', label: 'Programado', value: 'Programado' }
]

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Mais recentes' },
  { value: 'date-asc', label: 'Mais antigos' },
  { value: 'title-asc', label: 'Título A–Z' },
  { value: 'title-desc', label: 'Título Z–A' },
  { value: 'status-asc', label: 'Status' }
]

const router = useRouter()
const posts = ref<PostListItem[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const statusFilter = ref('todos')
const sortBy = ref('date-desc')
const page = ref(1)
const perPage = 8
const selected = ref<string[]>([])

const BLOG_URL = (import.meta.env.VITE_ASSETS_URL || '').split('/').slice(0, 3).join('/')

const categoriaNomes = ref<Record<string, string>>({})
function categoriaNomeFor(post: PostListItem) {
  return categoriaNomes.value[post.categoria_slug] || post.categoria_slug || '—'
}

async function fetchPosts() {
  loading.value = true
  try {
    const data = await postsApi.list()
    posts.value = data.items || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Erro ao carregar posts'
  } finally {
    loading.value = false
  }
}

async function fetchCategorias() {
  try {
    const data = await categoriesApi.list()
    categoriaNomes.value = Object.fromEntries((data.items || []).map((c) => [c.categoria_slug, c.nome]))
  } catch {
    // Without the category list, the table falls back to showing the raw slug
  }
}

onMounted(() => {
  fetchPosts()
  fetchCategorias()
})

function thumbFor(post: PostListItem) {
  if (post.imagem_destaque_url) {
    const base = post.imagem_destaque_url.replace(/\.(avif|webp|jpg|jpeg|png)$/i, '')
    return `${base}-480.webp`
  }
  return null
}

function thumbGradient(post: PostListItem) {
  const idx = (post.slug || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % THUMB_GRADIENTS.length
  return THUMB_GRADIENTS[idx]
}

const stats = computed(() => ({
  total: posts.value.length,
  publicado: posts.value.filter(p => p.status === 'Publicado').length,
  rascunho: posts.value.filter(p => p.status === 'Rascunho').length,
  programado: posts.value.filter(p => p.status === 'Programado').length
}))

function tabCount(tab: typeof STATUS_TABS[number]) {
  return tab.value === null ? posts.value.length : posts.value.filter(p => p.status === tab.value).length
}

const filteredSorted = computed(() => {
  let result = [...posts.value]
  const activeTab = STATUS_TABS.find(t => t.key === statusFilter.value)
  if (activeTab?.value) result = result.filter(p => p.status === activeTab.value)

  const q = search.value.trim().toLowerCase()
  if (q) {
    result = result.filter(p => `${p.titulo} ${p.slug}`.toLowerCase().includes(q))
  }

  const [field, dir] = sortBy.value.split('-')
  result.sort((a, b) => {
    let cmp = 0
    if (field === 'date') {
      cmp = (a.data_atualizacao || '').localeCompare(b.data_atualizacao || '')
    } else if (field === 'title') {
      cmp = a.titulo.localeCompare(b.titulo)
    } else if (field === 'status') {
      cmp = a.status.localeCompare(b.status)
    }
    return dir === 'desc' ? -cmp : cmp
  })
  return result
})

const pageInfo = computed(() => {
  const total = filteredSorted.value.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const current = Math.min(page.value, pages)
  const start = (current - 1) * perPage
  const items = filteredSorted.value.slice(start, start + perPage)
  const rangeText = total === 0 ? '0 posts' : `${start + 1}–${Math.min(start + perPage, total)} de ${total}`
  return { total, pages, current, items, rangeText }
})

function onSearch() {
  page.value = 1
}
function onFilterChange(key: string) {
  statusFilter.value = key
  page.value = 1
}
function setPage(n: number) {
  page.value = n
}

const allSelectedOnPage = computed(() =>
  pageInfo.value.items.length > 0 && pageInfo.value.items.every(p => selected.value.includes(p.slug))
)
function toggleAll() {
  if (allSelectedOnPage.value) {
    selected.value = selected.value.filter(s => !pageInfo.value.items.some(p => p.slug === s))
  } else {
    const toAdd = pageInfo.value.items.map(p => p.slug).filter(s => !selected.value.includes(s))
    selected.value = [...selected.value, ...toAdd]
  }
}
function toggleSelect(slug: string) {
  selected.value = selected.value.includes(slug)
    ? selected.value.filter(s => s !== slug)
    : [...selected.value, slug]
}
function clearSelection() {
  selected.value = []
}

const { toast, showToast } = useToast()

async function bulkDelete() {
  if (!confirm(`Excluir ${selected.value.length} post(s)? Esta ação não pode ser desfeita.`)) return
  try {
    await Promise.all(selected.value.map(slug => {
      const post = posts.value.find(p => p.slug === slug)
      // Legacy posts saved before the version field existed have none: the
      // backend's ConditionExpression already accepts any value in that case
      // (attribute_not_exists(#version) OR ...), so 0 is a safe placeholder.
      return postsApi.delete(slug, post!.version ?? 0)
    }))
    posts.value = posts.value.filter(p => !selected.value.includes(p.slug))
    showToast('Posts excluídos')
    clearSelection()
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Erro ao excluir posts', 'error')
  }
}

async function bulkPublish() {
  try {
    // version is required by updatePostInputSchema (optimistic concurrency) -
    // every call here 400'd before this fix, found during the Block 6 full
    // audit (docs/book/cases/CASE-008) because no test exercised this button.
    // Same `?? 0` fallback bulkDelete already used correctly for legacy posts
    // saved before the version field existed.
    await Promise.all(selected.value.map(slug => {
      const post = posts.value.find(p => p.slug === slug)
      return postsApi.update(slug, { status: 'Publicado', version: post?.version ?? 0 })
    }))
    await fetchPosts()
    showToast('Posts publicados')
    clearSelection()
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Erro ao publicar posts', 'error')
  }
}

async function duplicatePost(post: PostListItem) {
  try {
    const full = await postsApi.get(post.slug)
    const newSlug = `${full.slug}-copia-${Date.now()}`
    await postsApi.create({
      ...full,
      slug: newSlug,
      titulo: `${full.titulo} (cópia)`,
      status: 'Rascunho',
      e_popular: 0,
      e_projeto: 0
    })
    await fetchPosts()
    showToast('Post duplicado')
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Erro ao duplicar post', 'error')
  }
}

const confirmDeleteSlug = ref<string | null>(null)
const confirmDeleteVersion = ref<number | null>(null)
const confirmDeleteTitle = ref('')
function askDelete(post: PostListItem) {
  confirmDeleteSlug.value = post.slug
  confirmDeleteVersion.value = post.version ?? 0
  confirmDeleteTitle.value = post.titulo
}
function cancelDelete() {
  confirmDeleteSlug.value = null
  confirmDeleteVersion.value = null
}
async function confirmDeleteYes() {
  if (!confirmDeleteSlug.value || confirmDeleteVersion.value === null) return
  try {
    await postsApi.delete(confirmDeleteSlug.value, confirmDeleteVersion.value)
    posts.value = posts.value.filter(p => p.slug !== confirmDeleteSlug.value)
    selected.value = selected.value.filter(s => s !== confirmDeleteSlug.value)
    showToast('Post excluído')
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Erro ao excluir post', 'error')
  } finally {
    confirmDeleteSlug.value = null
    confirmDeleteVersion.value = null
  }
}

function formatDate(isoString: string | undefined) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleDateString('pt-BR')
}

function previewUrl(post: PostListItem) {
  return post.status === 'Publicado' && BLOG_URL ? `${BLOG_URL}/post/${post.slug}` : null
}
</script>

<template>
  <div data-screen-label="Posts" class="ia-posts">
    <Transition name="ia-toast">
      <div v-if="toast" :class="['ia-toast', `ia-toast--${toast.type}`]" role="alert">
        <span class="ia-toast-check">✓</span>{{ toast.message }}
      </div>
    </Transition>

    <div class="ia-header">
      <div class="ia-header-row">
        <div>
          <div class="ia-eyebrow"><span class="ia-eyebrow-line"></span>Conteúdo · Blog</div>
          <h1 class="ia-h1">Posts</h1>
          <p class="ia-subtitle">
            {{ posts.length }} posts · {{ stats.publicado }} publicados ·
            {{ stats.rascunho }} rascunhos · {{ stats.programado }} programados
          </p>
        </div>
        <button class="ia-btn-primary" @click="router.push('/posts/new')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
          Novo post
        </button>
      </div>

      <div class="ia-stats">
        <div class="ia-stat-card">
          <div class="ia-stat-label">Total</div>
          <div class="ia-stat-value" style="color:var(--petrol)">{{ stats.total }}</div>
        </div>
        <div class="ia-stat-card">
          <div class="ia-stat-label">No ar</div>
          <div class="ia-stat-value" style="color:var(--moss)">{{ stats.publicado }}</div>
        </div>
        <div class="ia-stat-card">
          <div class="ia-stat-label">Rascunhos</div>
          <div class="ia-stat-value" style="color:var(--slate-400)">{{ stats.rascunho }}</div>
        </div>
        <div class="ia-stat-card">
          <div class="ia-stat-label">Programados</div>
          <div class="ia-stat-value" style="color:var(--accent)">{{ stats.programado }}</div>
        </div>
      </div>

      <div class="ia-toolbar">
        <div class="ia-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7E969E" stroke-width="2" class="ia-search-icon"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input v-model="search" @input="onSearch" type="search" placeholder="Buscar por título ou slug…" class="ia-search-input" />
        </div>

        <div class="ia-tabs">
          <button
            v-for="tab in STATUS_TABS"
            :key="tab.key"
            :class="['ia-tab', { active: statusFilter === tab.key }]"
            @click="onFilterChange(tab.key)"
          >
            {{ tab.label }} <span class="ia-tab-count">{{ tabCount(tab) }}</span>
          </button>
        </div>

        <div class="ia-sort">
          <select v-model="sortBy" class="ia-select">
            <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div v-if="selected.length" class="ia-bulk-bar">
        <span class="ia-bulk-count">{{ selected.length }} selecionado(s)</span>
        <span style="flex:1"></span>
        <button class="ia-bulk-publish" @click="bulkPublish">Publicar</button>
        <button class="ia-bulk-delete" @click="bulkDelete">Excluir</button>
        <button class="ia-bulk-close" @click="clearSelection">✕</button>
      </div>
    </div>

    <div v-if="loading" class="ia-loading">Carregando dados…</div>
    <div v-else-if="error" class="ia-error">{{ error }}</div>

    <template v-else>
      <div class="ia-table">
        <div class="ia-row ia-row--head">
          <div class="ia-cell-check">
            <button class="ia-checkbox" :class="{ on: allSelectedOnPage }" @click="toggleAll">
              <span v-if="allSelectedOnPage">✓</span>
            </button>
          </div>
          <div>Título</div>
          <div>Status</div>
          <div>Categoria</div>
          <div>Data</div>
          <div>Leitura</div>
          <div style="text-align:right">Ações</div>
        </div>

        <div v-if="pageInfo.items.length === 0" class="ia-empty">
          <div class="ia-empty-title">Nenhum post encontrado</div>
          <div class="ia-empty-sub">Ajuste a busca ou os filtros de status.</div>
        </div>

        <div v-for="post in pageInfo.items" :key="post.slug" class="ia-row" :class="{ sel: selected.includes(post.slug) }">
          <div class="ia-cell-check">
            <button class="ia-checkbox" :class="{ on: selected.includes(post.slug) }" @click="toggleSelect(post.slug)">
              <span v-if="selected.includes(post.slug)">✓</span>
            </button>
          </div>
          <div class="ia-cell-title">
            <div class="ia-thumb" :style="thumbFor(post) ? { backgroundImage: `url(${thumbFor(post)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: thumbGradient(post) }"></div>
            <div class="ia-title-block">
              <div class="ia-title-text">{{ post.titulo }}</div>
              <div class="ia-title-meta">
                <span class="ia-slug">/{{ post.slug }}</span>
                <span v-if="post.e_popular" class="ia-badge ia-badge--popular">Popular</span>
                <span v-if="post.e_projeto" class="ia-badge ia-badge--projeto">Projeto</span>
              </div>
            </div>
          </div>
          <div>
            <span class="ia-status-pill" :class="`ia-status--${post.status.toLowerCase()}`">
              <span class="ia-status-dot"></span>{{ post.status }}
            </span>
          </div>
          <div class="ia-cat">{{ categoriaNomeFor(post) }}</div>
          <div class="ia-date">{{ formatDate(post.data_atualizacao) }}</div>
          <div class="ia-date">{{ post.tempo_leitura_min || '—' }} min</div>
          <div class="ia-actions">
            <a v-if="previewUrl(post)" :href="previewUrl(post)!" target="_blank" rel="noopener" class="ia-icon-btn" title="Pré-visualizar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </a>
            <router-link :to="`/post/${post.slug}`" class="ia-icon-btn" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z"/></svg>
            </router-link>
            <button class="ia-icon-btn" title="Duplicar" @click="duplicatePost(post)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>
            </button>
            <button class="ia-icon-btn ia-icon-btn--danger" title="Excluir" @click="askDelete(post)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="ia-pagination">
        <div class="ia-range">Mostrando {{ pageInfo.rangeText }}</div>
        <div class="ia-page-nav">
          <button class="ia-arrow" :disabled="pageInfo.current <= 1" @click="setPage(pageInfo.current - 1)">‹</button>
          <button
            v-for="n in pageInfo.pages"
            :key="n"
            class="ia-page-btn"
            :class="{ active: n === pageInfo.current }"
            @click="setPage(n)"
          >{{ n }}</button>
          <button class="ia-arrow" :disabled="pageInfo.current >= pageInfo.pages" @click="setPage(pageInfo.current + 1)">›</button>
        </div>
      </div>
    </template>

    <div v-if="confirmDeleteSlug" class="ia-modal-overlay" @click.self="cancelDelete">
      <div class="ia-modal-card">
        <div class="ia-modal-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A94C2D" stroke-width="1.9"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
        </div>
        <h3 class="ia-modal-title">Excluir post?</h3>
        <p class="ia-modal-text"><b style="color:#0C2027">{{ confirmDeleteTitle }}</b> será removido permanentemente. Esta ação não pode ser desfeita.</p>
        <div class="ia-modal-actions">
          <button class="ia-modal-btn-cancel" @click="cancelDelete">Cancelar</button>
          <button class="ia-modal-btn-danger" @click="confirmDeleteYes">Excluir</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ia-eyebrow {
  display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px;
}
.ia-eyebrow-line { width: 22px; height: 1px; background: var(--accent); }
.ia-h1 { font-weight: 800; font-size: 2rem; letter-spacing: -.04em; color: var(--petrol); line-height: 1.05; margin: 0; }
.ia-subtitle { font-size: 14px; color: var(--slate-500); margin: 10px 0 0; }

.ia-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }

.ia-btn-primary {
  display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #fff;
  border: none; cursor: pointer; font-weight: 600; font-size: 13.5px;
  padding: 11px 18px; border-radius: 10px; box-shadow: 0 6px 16px rgba(201,96,60,.28); transition: filter .15s;
}
.ia-btn-primary:hover { filter: brightness(.92); }

.ia-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-top: 26px; }
.ia-stat-card { background: #fff; border: 1px solid var(--border-color); border-radius: 13px; padding: 16px 18px; }
.ia-stat-label { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--slate-400); }
.ia-stat-value { font-weight: 800; font-size: 1.7rem; letter-spacing: -.03em; margin-top: 6px; }

.ia-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
.ia-search { position: relative; flex: 1; min-width: 220px; max-width: 340px; }
.ia-search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); }
.ia-search-input {
  width: 100%; font-family: var(--font-sans); font-size: 13.5px; color: var(--dark-700);
  background: #fff; border: 1px solid var(--border-color); border-radius: 10px; padding: 11px 14px 11px 38px;
}
.ia-search-input:focus { outline: none; border-color: var(--accent); }

.ia-tabs { display: flex; gap: 3px; background: var(--slate-100); border: 1px solid var(--border-color); border-radius: 10px; padding: 4px; }
.ia-tab {
  padding: 7px 13px; border-radius: 7px; border: none; cursor: pointer; font-size: 12.5px;
  white-space: nowrap; transition: all .15s; font-weight: 500; color: var(--slate-500); background: transparent;
}
.ia-tab.active { font-weight: 600; color: #fff; background: var(--petrol); }
.ia-tab-count { opacity: .55; font-weight: 600; margin-left: 4px; }

.ia-sort { position: relative; margin-left: auto; }
.ia-select {
  appearance: none; font-family: var(--font-sans); font-size: 13px; color: var(--slate-500);
  background: #fff; border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 34px 10px 14px; cursor: pointer;
}

.ia-bulk-bar {
  margin-top: 16px; background: var(--petrol); border-radius: 12px; padding: 11px 16px;
  display: flex; align-items: center; gap: 14px; color: #fff;
}
.ia-bulk-count { font-size: 13px; font-weight: 600; }
.ia-bulk-publish { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.2); color: #fff; font-size: 12.5px; font-weight: 600; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
.ia-bulk-delete { background: rgba(201,96,60,.9); border: none; color: #fff; font-size: 12.5px; font-weight: 600; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
.ia-bulk-close { background: transparent; border: none; color: rgba(255,255,255,.7); font-size: 16px; cursor: pointer; padding: 2px 6px; }

.ia-header { padding: 38px 40px 0; }

.ia-loading, .ia-error { padding: 40px; text-align: center; color: var(--slate-500); }

.ia-table {
  margin: 20px 40px 0; background: #fff; border: 1px solid var(--border-color); border-radius: 16px;
  overflow: hidden; box-shadow: 0 2px 5px rgba(12,32,39,.03);
}
.ia-row {
  display: grid; grid-template-columns: 42px minmax(200px,1fr) 122px 134px 100px 74px 128px;
  align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--slate-100);
}
.ia-row.sel { background: rgba(15,76,92,.035); }
.ia-row--head {
  height: 46px; padding: 0 18px; background: var(--slate-50); border-bottom: 1px solid var(--border-color);
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--slate-400);
}

.ia-cell-check { display: flex; }
.ia-checkbox {
  width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--slate-300); background: #fff;
  cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; transition: all .12s;
  color: #fff; font-size: 11px; line-height: 1; padding: 0;
}
.ia-checkbox.on { border-color: var(--accent); background: var(--accent); }

.ia-cell-title { display: flex; align-items: center; gap: 14px; min-width: 0; padding-right: 14px; }
.ia-thumb { width: 56px; height: 38px; border-radius: 8px; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.07); }
.ia-title-block { min-width: 0; }
.ia-title-text { font-weight: 700; font-size: 14px; color: var(--dark-700); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ia-title-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.ia-slug { font-family: var(--font-mono); font-size: 10.5px; color: var(--slate-400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ia-badge { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
.ia-badge--popular { color: #A94C2D; background: var(--accent-light); }
.ia-badge--projeto { color: var(--petrol); background: rgba(15,76,92,.09); }

.ia-status-pill {
  display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: .08em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; border: 1px solid;
}
.ia-status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ia-status--publicado  { color: var(--moss); background: rgba(63,107,71,.1); border-color: rgba(63,107,71,.28); }
.ia-status--programado { color: var(--accent); background: rgba(201,96,60,.1); border-color: rgba(201,96,60,.3); }
.ia-status--rascunho   { color: var(--slate-400); background: rgba(126,150,158,.12); border-color: rgba(126,150,158,.32); }

.ia-cat { font-size: 12.5px; color: var(--slate-500); }
.ia-date { font-family: var(--font-mono); font-size: 11px; color: var(--slate-400); }

.ia-actions { display: flex; align-items: center; justify-content: flex-end; gap: 5px; }
.ia-icon-btn {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border-color); background: #fff;
  color: var(--slate-500); cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.ia-icon-btn:hover { background: var(--slate-100); color: var(--petrol); }
.ia-icon-btn--danger:hover { background: var(--clay-red-bg); color: #A94C2D; border-color: var(--clay-red-bd); }

.ia-empty { padding: 56px 24px; text-align: center; }
.ia-empty-title { font-weight: 700; font-size: 15px; color: var(--petrol); }
.ia-empty-sub { font-size: 13px; color: var(--slate-400); margin-top: 6px; }

.ia-pagination { margin: 0 40px 44px; display: flex; align-items: center; justify-content: space-between; padding: 16px 4px; flex-wrap: wrap; gap: 12px; }
.ia-range { font-family: var(--font-mono); font-size: 11px; color: var(--slate-400); }
.ia-page-nav { display: flex; align-items: center; gap: 6px; }
.ia-arrow, .ia-page-btn {
  min-width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-color); background: #fff;
  color: var(--slate-500); font-size: 12.5px; font-weight: 500; cursor: pointer;
}
.ia-arrow { font-size: 16px; line-height: 1; }
.ia-arrow:disabled { cursor: default; opacity: .4; }
.ia-page-btn.active { border-color: var(--petrol); background: var(--petrol); color: #fff; font-weight: 600; }

.ia-modal-overlay {
  position: fixed; inset: 0; z-index: 70; background: rgba(8,50,61,.42);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.ia-modal-card { background: #fff; border-radius: 16px; padding: 28px; max-width: 420px; width: 100%; box-shadow: 0 24px 60px rgba(8,50,61,.3); }
.ia-modal-icon { width: 44px; height: 44px; border-radius: 11px; background: var(--clay-red-bg); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.ia-modal-title { font-weight: 800; font-size: 1.25rem; letter-spacing: -.02em; color: var(--petrol); margin: 0 0 8px; }
.ia-modal-text { font-size: 14px; line-height: 1.6; color: var(--slate-500); margin: 0 0 22px; }
.ia-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.ia-modal-btn-cancel { color: var(--slate-500); background: #fff; border: 1px solid var(--border-color); padding: 9px 16px; border-radius: 9px; cursor: pointer; font-weight: 600; font-size: 13px; }
.ia-modal-btn-cancel:hover { background: var(--slate-100); }
.ia-modal-btn-danger { color: #fff; background: #A94C2D; border: none; padding: 9px 16px; border-radius: 9px; cursor: pointer; font-weight: 600; font-size: 13px; }
.ia-modal-btn-danger:hover { filter: brightness(.92); }

.ia-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 60; background: var(--petrol); color: #fff;
  padding: 13px 18px; border-radius: 12px; box-shadow: 0 14px 34px rgba(12,32,39,.28);
  display: flex; align-items: center; gap: 12px; font-size: 13.5px; font-weight: 500;
}
.ia-toast--error { background: #A94C2D; }
.ia-toast-check { width: 22px; height: 22px; border-radius: 50%; background: var(--moss); display: flex; align-items: center; justify-content: center; font-size: 12px; flex: none; }
.ia-toast--error .ia-toast-check { background: #7A2E1A; }
.ia-toast-enter-active, .ia-toast-leave-active { transition: opacity .25s, transform .25s; }
.ia-toast-enter-from, .ia-toast-leave-to { opacity: 0; transform: translateY(14px); }
</style>
