import type { Channel } from '@/types';
import type { PlaylistCategory } from '@/lib/m3u';

export type { PlaylistCategory } from '@/lib/m3u';

const DB_NAME = 'nexus-playlist';
const DB_VERSION = 3;

const CHANNEL_STORE = 'channels';
const META_STORE = 'meta';

interface StoredChannel extends Channel {
  category: PlaylistCategory;
  nameLower: string;
  order?: number;
}

interface PlaylistMeta {
  key: 'playlist';

  totals: Record<
    PlaylistCategory,
    number
  >;

  groups: string[];

  groupsByCategory: Record<
    PlaylistCategory,
    string[]
  >;

  savedAt: number;

  /*
   * false = playlist ainda estava sendo importada
   * true = importação terminou corretamente
   */
  complete?: boolean;
}

const EMPTY_TOTALS: Record<
  PlaylistCategory,
  number
> = {
  live: 0,
  movies: 0,
  series: 0,
  radio: 0,
  other: 0,
};

const EMPTY_GROUPS: Record<
  PlaylistCategory,
  string[]
> = {
  live: [],
  movies: [],
  series: [],
  radio: [],
  other: [],
};

let dbPromise:
  Promise<IDBDatabase> | null =
  null;

/*
|--------------------------------------------------------------------------
| ABRE INDEXEDDB
|--------------------------------------------------------------------------
*/

function openDB():
  Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise =
    new Promise(
      (
        resolve,
        reject,
      ) => {
        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION,
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            let channelStore:
              IDBObjectStore;

            if (
              !db.objectStoreNames.contains(
                CHANNEL_STORE,
              )
            ) {
              channelStore =
                db.createObjectStore(
                  CHANNEL_STORE,
                  {
                    keyPath:
                      'id',
                  },
                );
            } else {
              channelStore =
                request.transaction!
                  .objectStore(
                    CHANNEL_STORE,
                  );
            }

            /*
             * Categoria
             */
            if (
              !channelStore.indexNames.contains(
                'category',
              )
            ) {
              channelStore.createIndex(
                'category',
                'category',
                {
                  unique:
                    false,
                },
              );
            }

            /*
             * Grupo
             */
            if (
              !channelStore.indexNames.contains(
                'group',
              )
            ) {
              channelStore.createIndex(
                'group',
                'group',
                {
                  unique:
                    false,
                },
              );
            }

            /*
             * Categoria + grupo
             */
            if (
              !channelStore.indexNames.contains(
                'categoryGroup',
              )
            ) {
              channelStore.createIndex(
                'categoryGroup',
                [
                  'category',
                  'group',
                ],
                {
                  unique:
                    false,
                },
              );
            }

            /*
             * Pesquisa por nome
             */
            if (
              !channelStore.indexNames.contains(
                'nameLower',
              )
            ) {
              channelStore.createIndex(
                'nameLower',
                'nameLower',
                {
                  unique:
                    false,
                },
              );
            }

            if (!channelStore.indexNames.contains('categoryOrder')) {
              channelStore.createIndex('categoryOrder', ['category', 'order'], { unique: false });
            }

            if (!channelStore.indexNames.contains('categoryGroupOrder')) {
              channelStore.createIndex('categoryGroupOrder', ['category', 'group', 'order'], { unique: false });
            }

            /*
             * Metadata
             */
            if (
              !db.objectStoreNames.contains(
                META_STORE,
              )
            ) {
              db.createObjectStore(
                META_STORE,
                {
                  keyPath:
                    'key',
                },
              );
            }
          };

        request.onsuccess =
          () => {
            const db =
              request.result;

            /*
             * Se outra aba fizer upgrade,
             * fecha esta conexão.
             */
            db.onversionchange =
              () => {
                db.close();

                dbPromise =
                  null;
              };

            resolve(db);
          };

        request.onerror =
          () => {
            dbPromise =
              null;

            reject(
              request.error ||
                new Error(
                  'Não foi possível abrir o armazenamento local.',
                ),
            );
          };

        request.onblocked =
          () => {
            console.warn(
              'IndexedDB aguardando outra aba liberar o banco.',
            );
          };
      },
    );

  return dbPromise;
}

/*
|--------------------------------------------------------------------------
| LIMPA PLAYLIST
|--------------------------------------------------------------------------
*/

export async function clearPlaylist():
  Promise<void> {
  const db =
    await openDB();

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          [
            CHANNEL_STORE,
            META_STORE,
          ],
          'readwrite',
        );

      tx
        .objectStore(
          CHANNEL_STORE,
        )
        .clear();

      tx
        .objectStore(
          META_STORE,
        )
        .clear();

      tx.oncomplete =
        () =>
          resolve();

      tx.onerror =
        () =>
          reject(
            tx.error ||
              new Error(
                'Erro ao limpar a playlist.',
              ),
          );

      tx.onabort =
        () =>
          reject(
            tx.error ||
              new Error(
                'Limpeza da playlist cancelada.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| SALVA LOTE
|--------------------------------------------------------------------------
|
| IMPORTANTE:
|
| Agora cada lote também atualiza META.
|
| Assim, se a importação parar antes do final,
| o aplicativo ainda consegue reconhecer que
| existe uma playlist válida no IndexedDB.
|
*/

export async function saveChannelBatch(
  channels: Channel[],
  category: PlaylistCategory,
): Promise<void> {
  if (!channels.length) {
    return;
  }

  const db =
    await openDB();

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      /*
       * CHANNEL_STORE e META_STORE
       * na mesma transaction.
       */
      const tx =
        db.transaction(
          [
            CHANNEL_STORE,
            META_STORE,
          ],
          'readwrite',
        );

      const channelStore =
        tx.objectStore(
          CHANNEL_STORE,
        );

      const metaStore =
        tx.objectStore(
          META_STORE,
        );

      /*
       * Salva canais.
       */
      for (
        const channel of
          channels
      ) {
        const item:
          StoredChannel = {
          ...channel,

          category,

          nameLower:
            channel.name
              .toLocaleLowerCase(
                'pt-BR',
              ),
        };

        channelStore.put(
          item,
        );
      }

      /*
       * Descobre categorias/grupos
       * existentes neste lote.
       */
      const batchGroups =
        Array.from(
          new Set(
            channels
              .map(
                (
                  channel,
                ) =>
                  channel.group ||
                  'Outros',
              )
              .filter(
                Boolean,
              ),
          ),
        );

      /*
       * Lê metadata atual.
       */
      const metaRequest =
        metaStore.get(
          'playlist',
        );

      metaRequest.onsuccess =
        () => {
          const existing =
            metaRequest.result as
              | PlaylistMeta
              | undefined;

          const totals =
            existing
              ? {
                  ...existing.totals,
                }
              : {
                  ...EMPTY_TOTALS,
                };

          /*
           * Soma o lote atual.
           *
           * Isso é usado principalmente
           * para exibição/cache provisório.
           *
           * Ao terminar a playlist,
           * savePlaylistMeta sobrescreve
           * pelos totais definitivos.
           */
          totals[category] =
            (
              totals[
                category
              ] ?? 0
            ) +
            channels.length;

          const groupsByCategory =
            existing
              ? {
                  live: [
                    ...existing
                      .groupsByCategory
                      .live,
                  ],

                  movies: [
                    ...existing
                      .groupsByCategory
                      .movies,
                  ],

                  series: [
                    ...existing
                      .groupsByCategory
                      .series,
                  ],

                  radio: [
                    ...existing
                      .groupsByCategory
                      .radio,
                  ],

                  other: [
                    ...existing
                      .groupsByCategory
                      .other,
                  ],
                }
              : {
                  ...EMPTY_GROUPS,

                  live: [],
                  movies: [],
                  series: [],
                  radio: [],
                  other: [],
                };

          groupsByCategory[
            category
          ] =
            Array.from(
              new Set([
                ...groupsByCategory[
                  category
                ],

                ...batchGroups,
              ]),
            );

          /*
           * Todos os grupos juntos.
           */
          const allGroups =
            Array.from(
              new Set([
                ...(existing
                  ?.groups ??
                  []),

                ...batchGroups,
              ]),
            );

          const meta:
            PlaylistMeta = {
            key:
              'playlist',

            totals,

            groups:
              allGroups,

            groupsByCategory,

            savedAt:
              Date.now(),

            /*
             * Playlist ainda pode
             * estar sendo importada.
             */
            complete:
              false,
          };

          metaStore.put(
            meta,
          );
        };

      metaRequest.onerror =
        () => {
          /*
           * Aborta a transaction.
           */
          try {
            tx.abort();
          } catch { /* transaction may already be closed */ }
        };

      tx.oncomplete =
        () =>
          resolve();

      tx.onerror =
        () =>
          reject(
            tx.error ||
              new Error(
                'Erro ao salvar lote da playlist.',
              ),
          );

      tx.onabort =
        () =>
          reject(
            tx.error ||
              new Error(
                'Operação de armazenamento cancelada.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| SALVA META FINAL
|--------------------------------------------------------------------------
|
| Quando a importação termina completamente,
| substituímos os valores provisórios pelos
| valores definitivos.
|
*/

export async function savePlaylistMeta(
  meta: Omit<
    PlaylistMeta,
    | 'key'
    | 'savedAt'
    | 'complete'
  >,
): Promise<void> {
  const db =
    await openDB();

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          META_STORE,
          'readwrite',
        );

      const finalMeta:
        PlaylistMeta = {
        key:
          'playlist',

        savedAt:
          Date.now(),

        complete:
          true,

        ...meta,
      };

      tx
        .objectStore(
          META_STORE,
        )
        .put(
          finalMeta,
        );

      tx.oncomplete =
        () =>
          resolve();

      tx.onerror =
        () =>
          reject(
            tx.error ||
              new Error(
                'Erro ao salvar metadados da playlist.',
              ),
          );

      tx.onabort =
        () =>
          reject(
            tx.error ||
              new Error(
                'Salvamento dos metadados cancelado.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| RECUPERA META
|--------------------------------------------------------------------------
*/

export async function getPlaylistMeta():
  Promise<PlaylistMeta | null> {
  const db =
    await openDB();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          META_STORE,
          'readonly',
        );

      const request =
        tx
          .objectStore(
            META_STORE,
          )
          .get(
            'playlist',
          );

      request.onsuccess =
        () => {
          resolve(
            (
              request.result as
                | PlaylistMeta
                | undefined
            ) ||
              null,
          );
        };

      request.onerror =
        () =>
          reject(
            request.error ||
              new Error(
                'Erro ao carregar metadados.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| REMOVE CAMPOS INTERNOS
|--------------------------------------------------------------------------
*/

function stripStored(
  channel:
    StoredChannel,
): Channel {
  const plain = { ...channel } as Partial<StoredChannel>;
  delete plain.category;
  delete plain.nameLower;
  delete plain.order;
  return plain as Channel;
}

/*
|--------------------------------------------------------------------------
| BUSCA CANAIS
|--------------------------------------------------------------------------
*/

export async function getChannels(
  category: PlaylistCategory,
  limit = 1500,
  offset = 0,
  group?: string,
): Promise<Channel[]> {
  const db =
    await openDB();

  return new Promise<
    Channel[]
  >(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          CHANNEL_STORE,
          'readonly',
        );

      const store =
        tx.objectStore(
          CHANNEL_STORE,
        );

      const hasOrderedIndex = group ? store.indexNames.contains('categoryGroupOrder') : store.indexNames.contains('categoryOrder');
      const index = group
        ? store.index(hasOrderedIndex ? 'categoryGroupOrder' : 'categoryGroup')
        : store.index(hasOrderedIndex ? 'categoryOrder' : 'category');

      const range = hasOrderedIndex
        ? group
          ? IDBKeyRange.bound([category, group, 0], [category, group, Number.MAX_SAFE_INTEGER])
          : IDBKeyRange.bound([category, 0], [category, Number.MAX_SAFE_INTEGER])
        : group
          ? IDBKeyRange.only([category, group])
          : IDBKeyRange.only(category);

      const request =
        index.openCursor(
          range,
        );

      const result:
        Channel[] = [];

      let skipped =
        0;

      request.onsuccess =
        () => {
          const cursor =
            request.result;

          if (
            !cursor ||
            result.length >=
              limit
          ) {
            resolve(
              result,
            );

            return;
          }

          if (
            skipped <
            offset
          ) {
            skipped +=
              1;

            cursor.continue();

            return;
          }

          result.push(
            stripStored(
              cursor.value as
                StoredChannel,
            ),
          );

          cursor.continue();
        };

      request.onerror =
        () =>
          reject(
            request.error ||
              new Error(
                'Erro ao carregar canais.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| BUSCA POR IDS
|--------------------------------------------------------------------------
*/

export async function getChannelsByIds(
  ids: string[],
  limit = 500,
): Promise<Channel[]> {
  if (!ids.length) {
    return [];
  }

  const db =
    await openDB();

  const wanted =
    ids.slice(
      0,
      limit,
    );

  return new Promise<
    Channel[]
  >(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          CHANNEL_STORE,
          'readonly',
        );

      const store =
        tx.objectStore(
          CHANNEL_STORE,
        );

      const result =
        new Map<
          string,
          Channel
        >();

      let pending =
        wanted.length;

      const finishOne =
        () => {
          pending -= 1;

          if (
            pending ===
            0
          ) {
            resolve(
              wanted
                .map(
                  (
                    id,
                  ) =>
                    result.get(
                      id,
                    ),
                )
                .filter(
                  Boolean,
                ) as Channel[],
            );
          }
        };

      for (
        const id of
          wanted
      ) {
        const request =
          store.get(
            id,
          );

        request.onsuccess =
          () => {
            if (
              request.result
            ) {
              result.set(
                id,

                stripStored(
                  request.result as
                    StoredChannel,
                ),
              );
            }

            finishOne();
          };

        request.onerror =
          () => {
            finishOne();
          };
      }

      tx.onerror =
        () =>
          reject(
            tx.error ||
              new Error(
                'Erro ao carregar favoritos.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| PESQUISA
|--------------------------------------------------------------------------
*/

export async function searchChannels(
  query: string,
  limit = 120,
): Promise<Channel[]> {
  const q =
    query
      .trim()
      .toLocaleLowerCase(
        'pt-BR',
      );

  if (!q) {
    return [];
  }

  const db =
    await openDB();

  return new Promise<
    Channel[]
  >(
    (
      resolve,
      reject,
    ) => {
      const tx =
        db.transaction(
          CHANNEL_STORE,
          'readonly',
        );

      const request =
        tx
          .objectStore(
            CHANNEL_STORE,
          )
          .openCursor();

      const result:
        Channel[] = [];

      request.onsuccess =
        () => {
          const cursor =
            request.result;

          if (
            !cursor ||
            result.length >=
              limit
          ) {
            resolve(
              result,
            );

            return;
          }

          const item =
            cursor.value as
              StoredChannel;

          if (
            item.nameLower.includes(
              q,
            )
          ) {
            result.push(
              stripStored(
                item,
              ),
            );
          }

          cursor.continue();
        };

      request.onerror =
        () =>
          reject(
            request.error ||
              new Error(
                'Erro ao pesquisar canais.',
              ),
          );
    },
  );
}

/*
|--------------------------------------------------------------------------
| REMOVE BANCO
|--------------------------------------------------------------------------
*/

export async function deletePlaylistDB():
  Promise<void> {
  if (dbPromise) {
    const db =
      await dbPromise;

    db.close();

    dbPromise =
      null;
  }

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      const request =
        indexedDB.deleteDatabase(
          DB_NAME,
        );

      request.onsuccess =
        () =>
          resolve();

      request.onerror =
        () =>
          reject(
            request.error ||
              new Error(
                'Não foi possível remover a playlist.',
              ),
          );

      request.onblocked =
        () => {
          console.warn(
            'Remoção do banco aguardando outra conexão.',
          );
        };
    },
  );
}
