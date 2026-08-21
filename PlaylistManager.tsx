import { useState } from 'react';
import { Plus, Trash2, ListVideo, Loader2, X, Link as LinkIcon, AlertCircle } from 'lucide-react';
import type { Playlist } from '@/types';
import { fetchPlaylist } from '@/lib/m3u';
import { storage } from '@/lib/storage';

interface PlaylistManagerProps {
  playlists: Playlist[];
  activePlaylistId: string | null;
  onAdd: (playlist: Playlist, channelsCount: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

export function PlaylistManager({
  playlists,
  activePlaylistId,
  onAdd,
  onRemove,
  onSelect,
}: PlaylistManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) {
      setError('Preencha o nome e a URL da lista.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const parsed = await fetchPlaylist(url.trim());
      if (parsed.channels.length === 0) {
        setError('Nenhum canal encontrado nesta lista.');
        return;
      }
      const newPlaylist: Playlist = {
        id: `${Date.now()}`,
        name: name.trim(),
        url: url.trim(),
        createdAt: Date.now(),
        channelCount: parsed.channels.length,
      };
      const all = [...playlists, newPlaylist];
      storage.savePlaylists(all);

      const channelsMap = storage.getChannels();
      channelsMap[newPlaylist.id] = parsed.channels;
      storage.saveChannels(channelsMap);

      onAdd(newPlaylist, parsed.channels.length);
      setName('');
      setUrl('');
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar a lista. Verifique a URL.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (id: string) => {
    const remaining = playlists.filter((p) => p.id !== id);
    storage.savePlaylists(remaining);
    const channelsMap = storage.getChannels();
    delete channelsMap[id];
    storage.saveChannels(channelsMap);
    onRemove(id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <ListVideo className="w-4 h-4" />
          Listas
        </h2>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {playlists.length === 0 && (
          <p className="text-xs text-white/40 px-1">
            Nenhuma lista adicionada ainda.
          </p>
        )}
        {playlists.map((p) => (
          <div
            key={p.id}
            className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
              activePlaylistId === p.id
                ? 'bg-white/15 border-white/30'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
            onClick={() => onSelect(p.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{p.name}</p>
              <p className="text-xs text-white/50">{p.channelCount ?? 0} canais</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(p.id);
              }}
              className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Remover lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-slate-900/90 border border-white/15 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">Nova lista IPTV</h3>
              <button
                onClick={() => {
                  setOpen(false);
                  setError('');
                }}
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">
                  Nome da lista
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Minha lista"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">
                  URL da lista (M3U / M3U8)
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://exemplo.com/lista.m3u"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    setError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-white/90 text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando…
                    </>
                  ) : (
                    'Adicionar'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
