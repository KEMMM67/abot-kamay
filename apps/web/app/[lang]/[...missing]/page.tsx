// apps/web/app/[lang]/[...missing]/page.tsx
//
// Any URL that matches no page. The root layout lives in the [lang] segment, so without this route an
// unknown URL would get Next.js's bare default 404, outside the site's layout and language. Calling
// notFound() here renders app/[lang]/not-found.tsx with the navbar, in the visitor's language, and
// still answers HTTP 404 (nothing above this route streams a loading state).
import { notFound } from 'next/navigation';

export default function MissingPage(): never {
  notFound();
}
