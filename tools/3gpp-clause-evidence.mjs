#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const archiveDirectory = process.argv[2] === undefined
  ? undefined
  : resolve(process.argv[2]);
if (archiveDirectory === undefined) {
  throw new Error('Usage: node tools/3gpp-clause-evidence.mjs <official-archive-directory>');
}

const specifications = Object.freeze([
  {
    documentId: 'TS 36.104',
    revision: '19.2.0',
    archiveName: '36104-j20.zip',
    archiveSha256: 'e053f9ea42e4e4ff64244225e4fbbf81c7eddde661d8539f290696628df5d7d5',
    documents: ['36104-j20.docx'],
    clauses: [
      ['5.6', 'whole-clause'],
    ],
  },
  {
    documentId: 'TS 36.141',
    revision: '19.1.0',
    archiveName: '36141-j10.zip',
    archiveSha256: '9b3b6eeff49b64892f6ffe3e306547495ac8d2ee2816dfeb7f3d4b2a036599cf',
    documents: ['36141-j10.docx'],
    clauses: [
      ['6.1.1', 'introductory-body-before-first-child'],
      ['6.1.1.1', 'whole-clause'],
      ['6.1.2', 'introductory-body-before-first-child'],
      ['6.1.2.1', 'whole-clause'],
      ['6.1.2.2', 'whole-clause'],
      ['6.1.2.3', 'whole-clause'],
      ['6.1.2.4', 'whole-clause'],
      ['6.1.2.5', 'whole-clause'],
      ['6.1.2.6', 'whole-clause'],
      ['6.1.2.7', 'whole-clause'],
      ['6.1.2.8', 'whole-clause'],
    ],
  },
  {
    documentId: 'TS 36.211',
    revision: '19.3.0',
    archiveName: '36211-j30.zip',
    archiveSha256: 'c1b132375361596e713dc51bfa20afbe4bf4c92bf1992c829a775f59a2ece5a1',
    documents: [
      '36211-j30_s00-s05.docx',
      '36211-j30_s06-s08.docx',
    ],
    clauses: [
      ['4.1', 'whole-clause'],
      ['6.2.1', 'whole-clause'],
      ['6.2.2', 'whole-clause'],
      ['6.2.3', 'introductory-body-before-first-child'],
      ['6.2.4', 'whole-clause'],
      ['6.3.1', 'whole-clause'],
      ['6.3.2', 'whole-clause'],
      ['6.3.3.1', 'whole-clause'],
      ['6.3.4.1', 'whole-clause'],
      ['6.3.5', 'whole-clause'],
      ['6.4', 'introductory-body-before-first-child'],
      ['6.6.1', 'whole-clause'],
      ['6.6.2', 'whole-clause'],
      ['6.6.3', 'whole-clause'],
      ['6.6.4', 'introductory-body-before-first-child'],
      ['6.7.1', 'whole-clause'],
      ['6.7.2', 'whole-clause'],
      ['6.7.3', 'whole-clause'],
      ['6.7.4', 'whole-clause'],
      ['6.8.1', 'whole-clause'],
      ['6.8.2', 'whole-clause'],
      ['6.8.3', 'whole-clause'],
      ['6.8.4', 'whole-clause'],
      ['6.8.5', 'whole-clause'],
      ['6.9', 'introductory-body-before-first-child'],
      ['6.9.1', 'whole-clause'],
      ['6.9.2', 'whole-clause'],
      ['6.9.3', 'whole-clause'],
      ['6.10.1', 'introductory-body-before-first-child'],
      ['6.10.1.1', 'whole-clause'],
      ['6.10.1.2', 'whole-clause'],
      ['6.11', 'introductory-body-before-first-child'],
      ['6.11.1', 'introductory-body-before-first-child'],
      ['6.11.1.1', 'whole-clause'],
      ['6.11.1.2', 'whole-clause'],
      ['6.11.2', 'introductory-body-before-first-child'],
      ['6.11.2.1', 'whole-clause'],
      ['6.11.2.2', 'whole-clause'],
      ['6.12', 'whole-clause'],
      ['7.1.1', 'whole-clause'],
      ['7.1.2', 'whole-clause'],
      ['7.2', 'whole-clause'],
    ],
  },
  {
    documentId: 'TS 36.212',
    revision: '19.3.0',
    archiveName: '36212-j30.zip',
    archiveSha256: '06a40a3b3214d372b0a6008ee1c885cd025ed30aef6399c9ea76a1d4593a1450',
    documents: ['36212-j30.docx'],
    clauses: [
      ['5.1.4.2.1', 'whole-clause'],
      ['5.3.4', 'introductory-body-before-first-child'],
      ['5.3.4.1', 'whole-clause'],
      ['5.3.5', 'introductory-body-before-first-child'],
      ['5.3.5.1', 'whole-clause'],
    ],
  },
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function xmlText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function headingParagraphs(documentXml) {
  const headings = [];
  for (const match of documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const paragraph = match[0];
    const style = paragraph.match(/<w:pStyle\s+w:val="(Heading[1-9])"\s*\/>/)?.[1];
    if (style === undefined) continue;
    const runs = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((run) => xmlText(run[1]));
    const clause = runs.find((run) => /^\d+(?:\.[0-9A-Za-z]+)+$/.test(run));
    if (clause === undefined) continue;
    headings.push({
      clause,
      depth: clause.split('.').length,
      offset: match.index,
      text: runs.join(''),
      style,
    });
  }
  return headings;
}

function extractClauseRange(documentXml, headings, clause, textRange) {
  const matches = headings.filter((heading) => heading.clause === clause);
  if (matches.length !== 1) {
    throw new Error(`Expected one normative heading ${clause}, found ${matches.length}`);
  }
  const start = matches[0];
  const startIndex = headings.indexOf(start);
  let end = documentXml.lastIndexOf('</w:body>');
  for (let index = startIndex + 1; index < headings.length; index += 1) {
    const candidate = headings[index];
    if (
      textRange === 'introductory-body-before-first-child'
      || candidate.depth <= start.depth
    ) {
      end = candidate.offset;
      break;
    }
  }
  const rawRange = documentXml.slice(start.offset, end).replace(/\r\n?/g, '\n').trim();
  if (!rawRange.startsWith('<w:p') || rawRange.length < 64) {
    throw new Error(`Extracted OOXML range for ${clause} is malformed`);
  }
  return {
    normativeTextSha256: sha256(Buffer.from(rawRange, 'utf8')),
    normativeTextByteLength: Buffer.byteLength(rawRange, 'utf8'),
    headingText: start.text,
  };
}

const extractionDirectory = mkdtempSync(join(tmpdir(), 'signallab-3gpp-clauses-'));
const report = {
  schemaVersion: 1,
  evidenceId: 'signallab.lte-etm1.release19.normative-ooxml-ranges',
  extraction: {
    implementationId: 'signallab.tools.3gpp-clause-evidence',
    implementationRevision: '1.0.0',
    format:
      'UTF-8 bytes of the exact WordprocessingML range from the numbered Heading paragraph through the applicable range boundary, with CR/CRLF normalized to LF and outer whitespace removed',
  },
  specifications: [],
  clauses: [],
};

for (const specification of specifications) {
  const archivePath = join(archiveDirectory, specification.archiveName);
  const archiveBytes = readFileSync(archivePath);
  if (sha256(archiveBytes) !== specification.archiveSha256) {
    throw new Error(`${specification.archiveName} does not match its pinned SHA-256`);
  }
  execFileSync('unzip', ['-q', '-o', archivePath, '-d', extractionDirectory]);

  const documents = specification.documents.map((documentName) => {
    const documentPath = join(extractionDirectory, documentName);
    const documentBytes = readFileSync(documentPath);
    const documentXml = execFileSync(
      'unzip',
      ['-p', documentPath, 'word/document.xml'],
      { encoding: 'utf8', maxBuffer: 128 * 1_048_576 },
    );
    return {
      documentName,
      documentPath,
      documentSha256: sha256(documentBytes),
      documentXml,
      documentXmlSha256: sha256(Buffer.from(documentXml, 'utf8')),
      headings: headingParagraphs(documentXml),
    };
  });

  report.specifications.push({
    documentId: specification.documentId,
    revision: specification.revision,
    sourceArchiveName: specification.archiveName,
    sourceArchiveSha256: specification.archiveSha256,
    documents: documents.map((document) => ({
      name: document.documentName,
      sha256: document.documentSha256,
      documentXmlSha256: document.documentXmlSha256,
    })),
  });

  for (const [clause, textRange] of specification.clauses) {
    const candidates = documents.filter(
      (document) => document.headings.some((heading) => heading.clause === clause),
    );
    if (candidates.length !== 1) {
      throw new Error(
        `Expected one document containing ${specification.documentId} ${clause}, found ${candidates.length}`,
      );
    }
    const document = candidates[0];
    const extracted = extractClauseRange(
      document.documentXml,
      document.headings,
      clause,
      textRange,
    );
    report.clauses.push({
      clauseKey: `${specification.documentId}@${specification.revision}#${clause}`,
      sourceArchiveSha256: specification.archiveSha256,
      sourceDocumentName: basename(document.documentName),
      sourceDocumentSha256: document.documentSha256,
      textRange,
      ...extracted,
    });
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
