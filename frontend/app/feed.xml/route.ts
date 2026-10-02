import { NextResponse } from 'next/server';
import { getAllPosts } from '@/lib/api';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/config';

export const revalidate = 3600;

interface FeedPost {
  slug: string;
  titulo?: string;
  resumo?: string;
  categoria_slug?: string;
  data_publicacao?: string;
}

// A literal "]]>" inside a CDATA section closes it early, same class of
// issue as HTML/script breakout - found during the Block 5 full audit
// (docs/book/cases/CASE-008). Low real-world risk (only the trusted admin
// sets titulo/resumo, no public submission path), but the fix is the
// standard, cheap CDATA-escaping trick: split the sequence across two
// adjacent CDATA sections so the content is reassembled by the XML parser.
function escapeCdata(value: string): string {
  return value.replace(/]]>/g, ']]]]><![CDATA[>');
}

export async function GET() {
  const data = await getAllPosts(undefined, 20).catch(() => ({ posts: [], nextToken: undefined }));
  const posts: FeedPost[] = data.posts || [];

  const items = posts
    .map((post) => {
      const pubDate = post.data_publicacao
        ? new Date(post.data_publicacao).toUTCString()
        : new Date().toUTCString();
      const link = `${SITE_URL}/post/${post.slug}`;

      return [
        '    <item>',
        `      <title><![CDATA[${escapeCdata(post.titulo || '')}]]></title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="true">${link}</guid>`,
        `      <description><![CDATA[${escapeCdata(post.resumo || '')}]]></description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        post.categoria_slug
          ? `      <category><![CDATA[${escapeCdata(post.categoria_slug)}]]></category>`
          : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${SITE_NAME}]]></title>
    <link>${SITE_URL}</link>
    <description><![CDATA[${SITE_DESCRIPTION}]]></description>
    <language>pt-BR</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
