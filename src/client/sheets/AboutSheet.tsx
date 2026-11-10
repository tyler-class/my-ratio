import { ABOUT_ICONS, aboutLinks, BUILT_BY, type AboutLinkKind } from '../kit/about';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { useSheets } from './context';

const LINKS = aboutLinks({
  title: 'Ratio',
  repo: 'tyler-class/ratio',
  email: 'ratio@tylerclass.net',
  coffee: 'Ratio pours for free. Buy me a coffee ☕',
});
/** An About link's icon: the kit's shared set, identical in every app. */
function LinkIcon({ kind, className }: { kind: AboutLinkKind; className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ABOUT_ICONS[kind] }}
    />
  );
}

/** About Ratio: version, what it is, who built it, and links (Selfhost Kit layout). */
export function AboutSheet() {
  const sheets = useSheets();
  return (
    <Sheet title="About Ratio" sub={`Version ${__APP_VERSION__}`} onClose={sheets.close}>
      <p style={{ marginTop: 0 }}>
        Ratio is a free, open-source coffee log: roasters, bags and every brew, with the numbers to
        dial in your next cup. It runs on your own Cloudflare account, so your data stays yours.
      </p>
      <p className="sub">{BUILT_BY}</p>
      <div style={{ marginTop: 8 }}>
        {LINKS.map((l) => (
          <a
            key={l.href}
            className="link-row"
            href={l.href}
            {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            <LinkIcon kind={l.kind} />
            <span>{l.label}</span>
            <Icon name="chevRight" size={16} />
          </a>
        ))}
      </div>
    </Sheet>
  );
}
