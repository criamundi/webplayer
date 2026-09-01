/*
  Link individual de renovação por lista.
  Ex.: checkout específico da Dezpila para aquele usuário.
*/

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS renewal_url text;

/*
  Mantém o campo opcional. Quando vazio, o player pode usar
  o link geral do provedor como fallback.
*/
COMMENT ON COLUMN public.iptv_lines.renewal_url IS
  'Link individual de pagamento/renovação da lista.';
