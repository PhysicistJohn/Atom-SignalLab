import { isUint8Array, sha256HexOfBytes } from './platform-bytes.js';
import {
  standardsTestCampaignSchema,
  standardsTestCatalogSchema,
  standardsTestCatalogSha256,
  type StandardsTestCampaign,
  type StandardsTestCatalog,
  type StandardsTestExecution,
  type StandardsVerificationMethod,
} from './standards-test-gate.js';

export const LTE_ETM1_1_CATALOG_ID = 'lte-etm1-1-release19-clause-tests';
export const LTE_ETM1_1_CATALOG_REVISION = '1.3.0';
export const LTE_ETM1_1_CATALOG_SHA256 =
  '830a2f03829a36b9dc249d64b50d821e6931d262115bccb529cb8db30db33072';
const PRESET_ID = 'lte-etm-1-1-10mhz-fdd';
const PRESET_REVISION = '2.0.0';
const GENERATOR_PROVIDER_ID = 'signallab';
const GENERATOR_IMPLEMENTATION_ID = 'signallab.lte-etm1-reference';
const TEST_PROVIDER_ID = 'signallab';
const TEST_IMPLEMENTATION_ID = 'signallab.lte-etm1-tests';
const ORACLE_PROVIDER_ID = 'srsran-project';
const ORACLE_IMPLEMENTATION_ID = 'srsran-4g.lte-phy-plus-etm-harness';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const verifiedClauseDigestBrand = Symbol('verified-lte-etm1-clause-digest');

export const LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256 =
  '1171018747af96b84e9fe7874ae7bbf0c426fad9a43b300c1c2e5b8288be0775';

export const LTE_ETM1_1_CLAUSE_TEXT_CANONICALIZATION =
  'SHA-256 hashes the UTF-8 bytes of the exact WordprocessingML range from the numbered Heading paragraph through the applicable range boundary, after CR/CRLF-to-LF normalization and removal of outer whitespace. A parent introductory range ends immediately before its first child Heading; a whole clause ends immediately before the next Heading at the same or higher level. The pinned official ZIP hash binds equations, tables, drawings, relationships, and media outside the document.xml range.';

interface SpecificationLock {
  readonly documentId: 'TS 36.104' | 'TS 36.141' | 'TS 36.211' | 'TS 36.212';
  readonly revision: '19.1.0' | '19.2.0' | '19.3.0';
  readonly release: 'Release 19';
  readonly sourceArchiveUrl: string;
  readonly sourceArchiveSha256: string;
}

const SPECIFICATION_LOCKS = Object.freeze({
  'TS 36.104': Object.freeze({
    documentId: 'TS 36.104',
    revision: '19.2.0',
    release: 'Release 19',
    sourceArchiveUrl:
      'https://www.3gpp.org/ftp/Specs/archive/36_series/36.104/36104-j20.zip',
    sourceArchiveSha256:
      'e053f9ea42e4e4ff64244225e4fbbf81c7eddde661d8539f290696628df5d7d5',
  }),
  'TS 36.141': Object.freeze({
    documentId: 'TS 36.141',
    revision: '19.1.0',
    release: 'Release 19',
    sourceArchiveUrl:
      'https://www.3gpp.org/ftp/Specs/archive/36_series/36.141/36141-j10.zip',
    sourceArchiveSha256:
      '9b3b6eeff49b64892f6ffe3e306547495ac8d2ee2816dfeb7f3d4b2a036599cf',
  }),
  'TS 36.211': Object.freeze({
    documentId: 'TS 36.211',
    revision: '19.3.0',
    release: 'Release 19',
    sourceArchiveUrl:
      'https://www.3gpp.org/ftp/Specs/archive/36_series/36.211/36211-j30.zip',
    sourceArchiveSha256:
      'c1b132375361596e713dc51bfa20afbe4bf4c92bf1992c829a775f59a2ece5a1',
  }),
  'TS 36.212': Object.freeze({
    documentId: 'TS 36.212',
    revision: '19.3.0',
    release: 'Release 19',
    sourceArchiveUrl:
      'https://www.3gpp.org/ftp/Specs/archive/36_series/36.212/36212-j30.zip',
    sourceArchiveSha256:
      '06a40a3b3214d372b0a6008ee1c885cd025ed30aef6399c9ea76a1d4593a1450',
  }),
} as const satisfies Readonly<Record<string, SpecificationLock>>);

export type LteEtm11ClauseKey =
  | `TS 36.104@19.2.0#${string}`
  | `TS 36.141@19.1.0#${string}`
  | `TS 36.211@19.3.0#${string}`
  | `TS 36.212@19.3.0#${string}`;

export interface LteEtm11ClauseDescriptor extends SpecificationLock {
  readonly clauseKey: LteEtm11ClauseKey;
  readonly clause: string;
  readonly textRange: 'whole-clause' | 'introductory-body-before-first-child';
}

function clause(
  documentId: keyof typeof SPECIFICATION_LOCKS,
  clauseId: string,
  textRange: LteEtm11ClauseDescriptor['textRange'] = 'whole-clause',
): LteEtm11ClauseDescriptor {
  const specification = SPECIFICATION_LOCKS[documentId];
  return Object.freeze({
    ...specification,
    clauseKey: `${documentId}@${specification.revision}#${clauseId}`,
    clause: clauseId,
    textRange,
  }) as LteEtm11ClauseDescriptor;
}

/**
 * The exact Release-19 normative ranges needed by the fixed digital profile.
 *
 * Broad section references are deliberately absent when a leaf clause states
 * the implemented operation. TS 36.211 clause 5.6 is uplink SC-FDMA and is
 * therefore not applicable. TS 36.212 clause 5.1.4.2.1 is applicable only to
 * the PDCCH REG-quadruplet interleaver permutation invoked by TS 36.211
 * clause 6.8.5; convolutional coding and rate matching are not claimed.
 */
export const LTE_ETM1_1_REQUIRED_CLAUSES = Object.freeze([
  clause('TS 36.104', '5.6'),
  clause('TS 36.141', '6.1.1', 'introductory-body-before-first-child'),
  clause('TS 36.141', '6.1.1.1'),
  clause('TS 36.141', '6.1.2', 'introductory-body-before-first-child'),
  clause('TS 36.141', '6.1.2.1'),
  clause('TS 36.141', '6.1.2.2'),
  clause('TS 36.141', '6.1.2.3'),
  clause('TS 36.141', '6.1.2.4'),
  clause('TS 36.141', '6.1.2.5'),
  clause('TS 36.141', '6.1.2.6'),
  clause('TS 36.141', '6.1.2.7'),
  clause('TS 36.141', '6.1.2.8'),
  clause('TS 36.211', '4.1'),
  clause('TS 36.211', '6.2.1'),
  clause('TS 36.211', '6.2.2'),
  clause('TS 36.211', '6.2.3', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.2.4'),
  clause('TS 36.211', '6.3.1'),
  clause('TS 36.211', '6.3.2'),
  clause('TS 36.211', '6.3.3.1'),
  clause('TS 36.211', '6.3.4.1'),
  clause('TS 36.211', '6.3.5'),
  clause('TS 36.211', '6.4', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.6.1'),
  clause('TS 36.211', '6.6.2'),
  clause('TS 36.211', '6.6.3'),
  clause('TS 36.211', '6.6.4', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.7.1'),
  clause('TS 36.211', '6.7.2'),
  clause('TS 36.211', '6.7.3'),
  clause('TS 36.211', '6.7.4'),
  clause('TS 36.211', '6.8.1'),
  clause('TS 36.211', '6.8.2'),
  clause('TS 36.211', '6.8.3'),
  clause('TS 36.211', '6.8.4'),
  clause('TS 36.211', '6.8.5'),
  clause('TS 36.211', '6.9', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.9.1'),
  clause('TS 36.211', '6.9.2'),
  clause('TS 36.211', '6.9.3'),
  clause('TS 36.211', '6.10.1', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.10.1.1'),
  clause('TS 36.211', '6.10.1.2'),
  clause('TS 36.211', '6.11', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.11.1', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.11.1.1'),
  clause('TS 36.211', '6.11.1.2'),
  clause('TS 36.211', '6.11.2', 'introductory-body-before-first-child'),
  clause('TS 36.211', '6.11.2.1'),
  clause('TS 36.211', '6.11.2.2'),
  clause('TS 36.211', '6.12'),
  clause('TS 36.211', '7.1.1'),
  clause('TS 36.211', '7.1.2'),
  clause('TS 36.211', '7.2'),
  clause('TS 36.212', '5.1.4.2.1'),
  clause('TS 36.212', '5.3.4', 'introductory-body-before-first-child'),
  clause('TS 36.212', '5.3.4.1'),
  clause('TS 36.212', '5.3.5', 'introductory-body-before-first-child'),
  clause('TS 36.212', '5.3.5.1'),
] as const);

interface NormativeRangePin {
  readonly sha256: string;
  readonly byteLength: number;
}

/**
 * WordprocessingML range identities reproduced from the exact official ZIPs
 * by tools/3gpp-clause-evidence.mjs. Changing any pin requires regenerating and
 * reviewing the retained content-addressed evidence report.
 */
export const LTE_ETM1_1_NORMATIVE_RANGE_PINS: Readonly<
  Record<LteEtm11ClauseKey, NormativeRangePin>
> = Object.freeze({
  'TS 36.104@19.2.0#5.6': Object.freeze({ sha256: '45be57c5db0261eda39b39c37b1409576221ddc18f85f97afa0ffcdeb445c8c1', byteLength: 79_638 }),
  'TS 36.141@19.1.0#6.1.1': Object.freeze({ sha256: 'd7b59ca9a0bb1f87cb04d6a85cad7e07865cfd54629a0ec575d4da358b5c19dd', byteLength: 22_965 }),
  'TS 36.141@19.1.0#6.1.1.1': Object.freeze({ sha256: '7dc08435212b5c707c0356e04792da6d1c6e6a4139967755545416186cb33efc', byteLength: 171_616 }),
  'TS 36.141@19.1.0#6.1.2': Object.freeze({ sha256: 'a1c7ff04097778321f6a2e46b0d94a963af01d9559c053a7a669ec9d4f8bdd15', byteLength: 9_062 }),
  'TS 36.141@19.1.0#6.1.2.1': Object.freeze({ sha256: 'f05cd2b5eacccca7631cd0891f429be4b666c4043a921aed9bdd1edd5a44f10d', byteLength: 2_687 }),
  'TS 36.141@19.1.0#6.1.2.2': Object.freeze({ sha256: '40898ebfb33ba1f8ef06053203cc0d592034715a5b08459bf32d68eae43a514c', byteLength: 2_674 }),
  'TS 36.141@19.1.0#6.1.2.3': Object.freeze({ sha256: '007c7d93dc184bd077bf396f04045d69309510af0d0cdff019b589cc04319fd9', byteLength: 2_676 }),
  'TS 36.141@19.1.0#6.1.2.4': Object.freeze({ sha256: '29022cfbbfedc1d34538ff91f47dadf1b3292eae92f679de1191861e4c5da677', byteLength: 4_914 }),
  'TS 36.141@19.1.0#6.1.2.5': Object.freeze({ sha256: '18910de031f3b4b6e7ae7ea0787ecc8f1fbbe25e1b0ebb82914168500c3920ac', byteLength: 3_721 }),
  'TS 36.141@19.1.0#6.1.2.6': Object.freeze({ sha256: 'be63aef9a04166c11760b97dd9706ff9025e4fe4b9cffa9103a3a15d5f18e82a', byteLength: 8_868 }),
  'TS 36.141@19.1.0#6.1.2.7': Object.freeze({ sha256: '2c64457bc841b70f2c78a5869240b62375d966f34ac88af703680a8cd654a0bb', byteLength: 4_848 }),
  'TS 36.141@19.1.0#6.1.2.8': Object.freeze({ sha256: '8e724e0b2ea1910b879703cccad814ad2a18daa37808871867a01ebf26b7b58d', byteLength: 16_796 }),
  'TS 36.211@19.3.0#4.1': Object.freeze({ sha256: 'e2b71081dd4a81d1a6d4aaec6e02d46b884e53574536f4533bf7faa9d20bdc51', byteLength: 34_171 }),
  'TS 36.211@19.3.0#6.2.1': Object.freeze({ sha256: 'f7071a75272c45f161d58f04df3508240a20b2fd1df23a57337d6beb581856c0', byteLength: 28_545 }),
  'TS 36.211@19.3.0#6.2.2': Object.freeze({ sha256: 'a9c2da32b1fce427d927828882d646f1d2111355cdb5ad441a0be3ad5297fde4', byteLength: 6_523 }),
  'TS 36.211@19.3.0#6.2.3': Object.freeze({ sha256: 'cc88b3740f87211b384c488b7a1ca274f9ef29a7d9e5dc2966acafea9ab38c83', byteLength: 33_679 }),
  'TS 36.211@19.3.0#6.2.4': Object.freeze({ sha256: 'afd07815e210ef73e96eec4d607913f04cf5f18a2772795ec80900b16b88c1c6', byteLength: 26_055 }),
  'TS 36.211@19.3.0#6.3.1': Object.freeze({ sha256: '1b9c02ee8618344106e300b4683b71e732022d23a9f8b91d80faae8ed4075cd3', byteLength: 24_601 }),
  'TS 36.211@19.3.0#6.3.2': Object.freeze({ sha256: '9b4aeab2a3c961bf5fc10d397467ad90af10be44deaa2bc28bb7bc2e5afb9d0b', byteLength: 6_856 }),
  'TS 36.211@19.3.0#6.3.3.1': Object.freeze({ sha256: '001819a0426f159bf12d41d952adba19fb2da2f76b293b2b4a7c5fb2644bd611', byteLength: 2_669 }),
  'TS 36.211@19.3.0#6.3.4.1': Object.freeze({ sha256: '844420b710f86cf186e4fe88c48931c5f05e4594b1c87f3d84ce636e6538e421', byteLength: 3_347 }),
  'TS 36.211@19.3.0#6.3.5': Object.freeze({ sha256: '3c58c29cea0ff0fe4076a4ababc2c6c67b8d0e3f10354aa0722e4a71a83be916', byteLength: 12_362 }),
  'TS 36.211@19.3.0#6.4': Object.freeze({ sha256: '9d4ee27acf14db4424fc58dcafb1374321eca92556dcaa1fc9e1709ae3429425', byteLength: 48_108 }),
  'TS 36.211@19.3.0#6.6.1': Object.freeze({ sha256: '1575b567260f66520dfe593720fdc5a84cffebc7fb4f3830952c849ab282b710', byteLength: 6_163 }),
  'TS 36.211@19.3.0#6.6.2': Object.freeze({ sha256: '0f83377cce417ed33867f8ae271e9cc851d1082afb9b866bcdfbf3da8032f018', byteLength: 5_121 }),
  'TS 36.211@19.3.0#6.6.3': Object.freeze({ sha256: '253266808c54623e0a412742f063746f72ca6bc447a6f5a9144d10498c126e2f', byteLength: 5_023 }),
  'TS 36.211@19.3.0#6.6.4': Object.freeze({ sha256: 'f44ba1a26f143ef980c78b31fc1ec7fc45118ef9168ae383a28e4dc8cd2feea5', byteLength: 49_773 }),
  'TS 36.211@19.3.0#6.7.1': Object.freeze({ sha256: '2a92d2bc42b94d6533572e0b68006d9cdf17c7f8a05c42a51f94bddf99695202', byteLength: 3_943 }),
  'TS 36.211@19.3.0#6.7.2': Object.freeze({ sha256: '9aa1eeeec90b5cd3f2987707f34e9b900d22365d35fe2cfacb1bc98d7d424d02', byteLength: 4_951 }),
  'TS 36.211@19.3.0#6.7.3': Object.freeze({ sha256: '34c2249d17a8bc425227b9a7e242658010f289d61f1deff39800b20e43a8b970', byteLength: 5_099 }),
  'TS 36.211@19.3.0#6.7.4': Object.freeze({ sha256: '45bbe34a8428b62b05bde600823f890ffcad9cec91c14bb453ccc72c7e8061d1', byteLength: 5_924 }),
  'TS 36.211@19.3.0#6.8.1': Object.freeze({ sha256: '952094f2f329a08d2a6cab67545871a9b4490de10764a10ca3bbd0192e855f46', byteLength: 18_191 }),
  'TS 36.211@19.3.0#6.8.2': Object.freeze({ sha256: '6b81046109596d2a50374cd0e68647418084f85d753279a9ddaa7fd6c249c7ef', byteLength: 9_189 }),
  'TS 36.211@19.3.0#6.8.3': Object.freeze({ sha256: '8098d811478b2d97b0b7923f8db53b596eb30b611b0cf694aa1f80bbb5584fe2', byteLength: 5_086 }),
  'TS 36.211@19.3.0#6.8.4': Object.freeze({ sha256: '5417033d65ae713fdc06f43d5f489f8914b2011871e77f8e195e5b189a705ab0', byteLength: 4_126 }),
  'TS 36.211@19.3.0#6.8.5': Object.freeze({ sha256: 'aa3869840e9359c192a390144b0e8f5bff6ae15e165e6ca498a47255ee2a1108', byteLength: 25_046 }),
  'TS 36.211@19.3.0#6.9': Object.freeze({ sha256: 'd5e915181c3ec3da010fceea7cc81db9df94d4ec3ca73063cbd971a7e3ff3294', byteLength: 48_978 }),
  'TS 36.211@19.3.0#6.9.1': Object.freeze({ sha256: 'fc6e8c485baf5c9945661fc1ac93755847482919fe4b346a0019b202984400d9', byteLength: 32_741 }),
  'TS 36.211@19.3.0#6.9.2': Object.freeze({ sha256: '6e8df0acc294054cc838e432ec788b7ad0364abb1241e1f37632a26cd926330d', byteLength: 18_493 }),
  'TS 36.211@19.3.0#6.9.3': Object.freeze({ sha256: '6f0332b9883481c887c90ae4412fa0d2daa4a118e21ce2e5e0328656990b1f40', byteLength: 43_823 }),
  'TS 36.211@19.3.0#6.10.1': Object.freeze({ sha256: '5cc3719273b2edcde656bd84649825ef14323363d85e5cc004a18eff3d3ef040', byteLength: 4_587 }),
  'TS 36.211@19.3.0#6.10.1.1': Object.freeze({ sha256: 'b743be5951e6786e85c64fbc854da56254bef5f06b3176f8e4a449781575ff09', byteLength: 4_983 }),
  'TS 36.211@19.3.0#6.10.1.2': Object.freeze({ sha256: 'ab18c7161dff76be9ed61a8013ac39679cba624327ab424020c79731bb7a4993', byteLength: 12_436 }),
  'TS 36.211@19.3.0#6.11': Object.freeze({ sha256: '39205eba9fc91d4e3e49453975f57a9223456a208f1091bd3dcb0273c808fa38', byteLength: 2_702 }),
  'TS 36.211@19.3.0#6.11.1': Object.freeze({ sha256: '2f9e9d43a3cf972394d869d5a4ba152e72bb8f378900924e7d2ead7ede25b9a8', byteLength: 472 }),
  'TS 36.211@19.3.0#6.11.1.1': Object.freeze({ sha256: '04b1c8495d4b3186a225e4ff256f2c2662cc7e07bb1c8c7709e76baf3b3db2d9', byteLength: 8_735 }),
  'TS 36.211@19.3.0#6.11.1.2': Object.freeze({ sha256: '81d371cf0bc90fe88edd6dba6b9835e4a50735d810461ca782dc3812401a63ee', byteLength: 11_662 }),
  'TS 36.211@19.3.0#6.11.2': Object.freeze({ sha256: '24f0502249141636f4f08fc6f3955a5b82101fc31aabe957b768d4a26234699c', byteLength: 474 }),
  'TS 36.211@19.3.0#6.11.2.1': Object.freeze({ sha256: 'e2bb3f6a6ff97f79cbbc76cc4253c6a867eb5a7e8b9deccf3fd7a03fc4144d08', byteLength: 240_478 }),
  'TS 36.211@19.3.0#6.11.2.2': Object.freeze({ sha256: 'd88f41f674fa1640e6867b7b508339e46ecadbe247f08ddb617cda37a42ef7fc', byteLength: 8_253 }),
  'TS 36.211@19.3.0#6.12': Object.freeze({ sha256: '3da89392fadb1b8e39ddaf3a558fc790c6e75ec14741b7ccffb247d1c8335523', byteLength: 41_257 }),
  'TS 36.211@19.3.0#7.1.1': Object.freeze({ sha256: '9e767e5a0b12fee401c51dfd619ee2b2b100146f353b34bbbe3c36c524afcc0c', byteLength: 10_976 }),
  'TS 36.211@19.3.0#7.1.2': Object.freeze({ sha256: '88385e96309a07da08f28ed92cfa31f7e7c3a58a2231a32dfe0e67dfcde02cea', byteLength: 34_501 }),
  'TS 36.211@19.3.0#7.2': Object.freeze({ sha256: '60991d0add5642191f2c7880b2a14b2c960fe9005f00d67eef17ddf540294873', byteLength: 5_570 }),
  'TS 36.212@19.3.0#5.1.4.2.1': Object.freeze({ sha256: '4718155c82a3465dcd384c2ae6a807e79a7aaba2e1db791e2acd27c85fa4ea38', byteLength: 18_414 }),
  'TS 36.212@19.3.0#5.3.4': Object.freeze({ sha256: 'db86831c821cd8b66f8f4805f628f3c25de8560c0e93ac8302874b19da4d4bc9', byteLength: 3_380 }),
  'TS 36.212@19.3.0#5.3.4.1': Object.freeze({ sha256: '30b23c3ee973a91391a5e5019eae1589dee82e04c2500646fd2a81b0ec2e13cf', byteLength: 6_242 }),
  'TS 36.212@19.3.0#5.3.5': Object.freeze({ sha256: 'dc7be129206b15de901eaa4750c1b801b497aada3221d3612f4628daffe95499', byteLength: 1_983 }),
  'TS 36.212@19.3.0#5.3.5.1': Object.freeze({ sha256: '98b16baef79bb6ddf87953ce5fe3b4ff133eaf8962f7c7f1d6eacf217502a5df', byteLength: 4_763 }),
});

const CLAUSES_BY_KEY = new Map(
  LTE_ETM1_1_REQUIRED_CLAUSES.map((descriptor) => [descriptor.clauseKey, descriptor]),
);

export interface LteEtm11ClauseTextEvidenceInput {
  readonly clauseKey: LteEtm11ClauseKey;
  readonly sourceArchiveSha256: string;
  readonly normativeOoxmlRange: string;
  readonly extractionReportSha256: string;
}

export interface VerifiedLteEtm11ClauseDigest {
  readonly clauseKey: LteEtm11ClauseKey;
  readonly sourceArchiveSha256: string;
  readonly normativeTextSha256: string;
  readonly normativeTextByteLength: number;
  readonly extractionReportSha256: string;
  readonly [verifiedClauseDigestBrand]: true;
}

function createVerifiedClauseDigest(
  descriptor: LteEtm11ClauseDescriptor,
  pin: NormativeRangePin,
): VerifiedLteEtm11ClauseDigest {
  const evidence = {
    clauseKey: descriptor.clauseKey,
    sourceArchiveSha256: descriptor.sourceArchiveSha256,
    normativeTextSha256: pin.sha256,
    normativeTextByteLength: pin.byteLength,
    extractionReportSha256: LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256,
  } as VerifiedLteEtm11ClauseDigest;
  Object.defineProperty(evidence, verifiedClauseDigestBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(evidence);
}

function assertNonPlaceholderDigest(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase hexadecimal SHA-256 digest`);
  }
  if (new Set(value).size < 8) {
    throw new TypeError(`${label} is a placeholder, not a content digest`);
  }
}

/**
 * Canonicalizes an extracted normative WordprocessingML range to the exact
 * bytes hashed by this catalog. The catalog ships no copyrighted clause text.
 */
export function canonicalizeLteEtm11NormativeClauseText(ooxml: string): Uint8Array {
  if (typeof ooxml !== 'string') {
    throw new TypeError('Normative clause WordprocessingML must be a string');
  }
  const canonical = ooxml
    .replace(/\r\n?/g, '\n')
    .trim();
  if (canonical.length < 64) {
    throw new TypeError('Normative clause WordprocessingML is too short to be an extracted range');
  }
  if (!canonical.startsWith('<w:p') || !canonical.includes('<w:pStyle')) {
    throw new TypeError('Normative clause range must begin with its WordprocessingML Heading');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(canonical)) {
    throw new TypeError('Normative clause WordprocessingML contains unsupported control characters');
  }
  return new TextEncoder().encode(canonical);
}

/**
 * Verifies a reproduced clause range against independently retained pins.
 *
 * The expected digest and byte length are not caller-controlled: both are
 * frozen below from the content-addressed retained extraction report.
 */
export function verifyLteEtm11ClauseDigest(
  input: LteEtm11ClauseTextEvidenceInput,
): VerifiedLteEtm11ClauseDigest {
  const descriptor = CLAUSES_BY_KEY.get(input.clauseKey);
  if (descriptor === undefined) {
    throw new TypeError(`Clause ${input.clauseKey} is not required by the fixed E-TM1.1 profile`);
  }
  if (input.sourceArchiveSha256 !== descriptor.sourceArchiveSha256) {
    throw new TypeError(`Clause ${input.clauseKey} is not bound to the pinned official archive`);
  }
  if (input.extractionReportSha256 !== LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256) {
    throw new TypeError('Clause extraction is not bound to the retained evidence report');
  }
  const pin = LTE_ETM1_1_NORMATIVE_RANGE_PINS[input.clauseKey];
  if (pin === undefined) {
    throw new TypeError(`Clause ${input.clauseKey} has no retained normative-range pin`);
  }
  const canonicalBytes = canonicalizeLteEtm11NormativeClauseText(
    input.normativeOoxmlRange,
  );
  const observedDigest = sha256HexOfBytes(canonicalBytes);
  if (observedDigest !== pin.sha256 || canonicalBytes.byteLength !== pin.byteLength) {
    throw new TypeError(`Pinned normative-range mismatch for ${input.clauseKey}`);
  }
  return createVerifiedClauseDigest(descriptor, pin);
}

function retainedClauseRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Retained clause evidence contains a malformed record');
  }
  return value as Record<string, unknown>;
}

/**
 * Admits the checked-in extraction report only by its raw content identity.
 *
 * This is the persistence path for clause proofs: the JSON cannot manufacture
 * a new digest because its complete byte stream is pinned here. The explicit
 * archive lane separately regenerates these exact bytes from the official ZIPs.
 */
export function parseRetainedLteEtm11ClauseEvidence(
  reportBytes: Uint8Array,
): readonly VerifiedLteEtm11ClauseDigest[] {
  if (!isUint8Array(reportBytes)) {
    throw new TypeError('Retained clause evidence must be supplied as UTF-8 bytes');
  }
  if (sha256HexOfBytes(reportBytes) !== LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256) {
    throw new TypeError('Retained clause evidence report SHA-256 does not match');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reportBytes));
  } catch (cause) {
    throw new TypeError('Retained clause evidence report is not valid UTF-8 JSON', {
      cause,
    });
  }
  const report = retainedClauseRecord(parsed);
  const reportClauses = report.clauses;
  if (
    report.schemaVersion !== 1
    || report.evidenceId !== 'signallab.lte-etm1.release19.normative-ooxml-ranges'
    || !Array.isArray(reportClauses)
    || reportClauses.length !== LTE_ETM1_1_REQUIRED_CLAUSES.length
  ) {
    throw new TypeError('Retained clause evidence report has the wrong identity or coverage');
  }

  return Object.freeze(LTE_ETM1_1_REQUIRED_CLAUSES.map((descriptor, index) => {
    const record = retainedClauseRecord(reportClauses[index]);
    const pin = LTE_ETM1_1_NORMATIVE_RANGE_PINS[descriptor.clauseKey];
    if (pin === undefined) {
      throw new TypeError(`No retained range pin exists for ${descriptor.clauseKey}`);
    }
    if (
      record.clauseKey !== descriptor.clauseKey
      || record.sourceArchiveSha256 !== descriptor.sourceArchiveSha256
      || record.textRange !== descriptor.textRange
      || record.normativeTextSha256 !== pin.sha256
      || record.normativeTextByteLength !== pin.byteLength
    ) {
      throw new TypeError(
        `Retained clause evidence does not match the frozen range for ${descriptor.clauseKey}`,
      );
    }
    return createVerifiedClauseDigest(descriptor, pin);
  }));
}

type FixedRequirementId =
  | 'frame-grid'
  | 'crs-port0'
  | 'pss-sss'
  | 'pbch-zero-input'
  | 'pcfich-cfi1'
  | 'phich-zero-hi'
  | 'pdcch-five-2cce'
  | 'pdsch-full-qpsk'
  | 'ofdm-rendering';

interface FixedRequirement {
  readonly fixedRequirementId: FixedRequirementId;
  readonly title: string;
  readonly applicabilityRationale: string;
  readonly clauseKeys: readonly LteEtm11ClauseKey[];
}

function keys(...values: readonly LteEtm11ClauseKey[]): readonly LteEtm11ClauseKey[] {
  return Object.freeze(values);
}

const FIXED_REQUIREMENTS = Object.freeze([
  Object.freeze({
    fixedRequirementId: 'frame-grid',
    title: '50-RB, 15 kHz, normal-CP, frame-structure-type-1 resource grid',
    applicabilityRationale:
      'The fixed 10 MHz FDD E-TM1.1 preset emits one 10 ms frame with 50 resource blocks and antenna port 0.',
    clauseKeys: keys(
      'TS 36.104@19.2.0#5.6',
      'TS 36.141@19.1.0#6.1.1',
      'TS 36.141@19.1.0#6.1.1.1',
      'TS 36.141@19.1.0#6.1.2',
      'TS 36.211@19.3.0#4.1',
      'TS 36.211@19.3.0#6.2.1',
      'TS 36.211@19.3.0#6.2.2',
      'TS 36.211@19.3.0#6.2.3',
      'TS 36.211@19.3.0#6.2.4',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'crs-port0',
    title: 'Cell-specific reference signal on antenna port 0',
    applicabilityRationale:
      'E-TM1.1 requires cell-specific reference signals generated and mapped for p=0 and N_ID_cell=1.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.1',
      'TS 36.211@19.3.0#6.10.1',
      'TS 36.211@19.3.0#6.10.1.1',
      'TS 36.211@19.3.0#6.10.1.2',
      'TS 36.211@19.3.0#7.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'pss-sss',
    title: 'Primary and secondary synchronization signals',
    applicabilityRationale:
      'The FDD E-TM frame carries PCI=1 PSS and SSS in subframes 0 and 5.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.2',
      'TS 36.141@19.1.0#6.1.2.3',
      'TS 36.211@19.3.0#6.11',
      'TS 36.211@19.3.0#6.11.1',
      'TS 36.211@19.3.0#6.11.1.1',
      'TS 36.211@19.3.0#6.11.1.2',
      'TS 36.211@19.3.0#6.11.2',
      'TS 36.211@19.3.0#6.11.2.1',
      'TS 36.211@19.3.0#6.11.2.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'pbch-zero-input',
    title: 'E-TM1.1 PBCH all-zero physical-channel input at frame number modulo four zero',
    applicabilityRationale:
      'The fixed frame starts at fn=0 and maps the prescribed 480 all-zero PBCH input bits through the E-TM one-layer, port-0 identity stage.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.4',
      'TS 36.211@19.3.0#6.3.3.1',
      'TS 36.211@19.3.0#6.3.4.1',
      'TS 36.211@19.3.0#6.6.1',
      'TS 36.211@19.3.0#6.6.2',
      'TS 36.211@19.3.0#6.6.3',
      'TS 36.211@19.3.0#6.6.4',
      'TS 36.211@19.3.0#7.1.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'pcfich-cfi1',
    title: 'CFI=1 PCFICH',
    applicabilityRationale:
      'The 50-RB E-TM1.1 control region uses one OFDM symbol and the CFI=1 codeword through the E-TM one-layer, port-0 identity stage.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.5',
      'TS 36.212@19.3.0#5.3.4',
      'TS 36.212@19.3.0#5.3.4.1',
      'TS 36.211@19.3.0#6.2.4',
      'TS 36.211@19.3.0#6.3.3.1',
      'TS 36.211@19.3.0#6.3.4.1',
      'TS 36.211@19.3.0#6.7.1',
      'TS 36.211@19.3.0#6.7.2',
      'TS 36.211@19.3.0#6.7.3',
      'TS 36.211@19.3.0#6.7.4',
      'TS 36.211@19.3.0#7.1.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'phich-zero-hi',
    title: 'Two PHICH groups with sequence indices 0 and 4 and all-zero HI bits',
    applicabilityRationale:
      'The fixed E-TM1.1 table selects normal PHICH, Ng=1/6, two PHICH per group, zero HI, and one-layer port-0 identity processing.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.6',
      'TS 36.212@19.3.0#5.3.5',
      'TS 36.212@19.3.0#5.3.5.1',
      'TS 36.211@19.3.0#6.2.4',
      'TS 36.211@19.3.0#6.3.3.1',
      'TS 36.211@19.3.0#6.3.4.1',
      'TS 36.211@19.3.0#6.9',
      'TS 36.211@19.3.0#6.9.1',
      'TS 36.211@19.3.0#6.9.2',
      'TS 36.211@19.3.0#6.9.3',
      'TS 36.211@19.3.0#7.1.1',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'pdcch-five-2cce',
    title: 'Five two-CCE all-zero PDCCHs occupying all 90 available REGs',
    applicabilityRationale:
      'E-TM1.1 allocates five PDCCHs at CCE 0, 2, 4, 6, and 8 with two CCEs each and one-layer port-0 identity processing.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.7',
      'TS 36.212@19.3.0#5.1.4.2.1',
      'TS 36.211@19.3.0#6.2.4',
      'TS 36.211@19.3.0#6.3.3.1',
      'TS 36.211@19.3.0#6.3.4.1',
      'TS 36.211@19.3.0#6.8.1',
      'TS 36.211@19.3.0#6.8.2',
      'TS 36.211@19.3.0#6.8.3',
      'TS 36.211@19.3.0#6.8.4',
      'TS 36.211@19.3.0#6.8.5',
      'TS 36.211@19.3.0#7.1.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'pdsch-full-qpsk',
    title: 'Full-allocation QPSK PDSCH with prescribed all-zero input bits and n_RNTI=0',
    applicabilityRationale:
      'E-TM1.1 assigns every PDSCH PRB to RNTI 0 using QPSK, all-zero physical-channel input, and one-layer port-0 identity processing.',
    clauseKeys: keys(
      'TS 36.141@19.1.0#6.1.2.8',
      'TS 36.211@19.3.0#6.2.3',
      'TS 36.211@19.3.0#6.3.1',
      'TS 36.211@19.3.0#6.3.2',
      'TS 36.211@19.3.0#6.3.3.1',
      'TS 36.211@19.3.0#6.3.4.1',
      'TS 36.211@19.3.0#6.3.5',
      'TS 36.211@19.3.0#6.4',
      'TS 36.211@19.3.0#7.1.2',
    ),
  }),
  Object.freeze({
    fixedRequirementId: 'ofdm-rendering',
    title: '15.36 Msample/s OFDM rendering with 1024-point IFFT and normal cyclic prefixes',
    applicabilityRationale:
      'The exact digital artifact renders the 50-RB grid to 153600 complex samples for one 10 ms frame.',
    clauseKeys: keys('TS 36.211@19.3.0#6.12'),
  }),
] as const satisfies readonly FixedRequirement[]);

export interface LteEtm11SemanticAssertionContract {
  readonly schemaVersion: 1;
  readonly testId: string;
  readonly sourceLocation: string;
  readonly sourceFileSha256: string;
  readonly method: StandardsVerificationMethod;
  readonly preconditions: readonly string[];
  readonly assertions: readonly string[];
  readonly coversFixedRequirementIds: readonly FixedRequirementId[];
  readonly implementation: {
    readonly providerId: string;
    readonly implementationId: string;
  };
}

const ALL_FIXED_REQUIREMENTS = Object.freeze(
  FIXED_REQUIREMENTS.map((requirement) => requirement.fixedRequirementId),
);
const CHANNEL_REQUIREMENTS = Object.freeze([
  'crs-port0',
  'pss-sss',
  'pbch-zero-input',
  'pcfich-cfi1',
  'phich-zero-hi',
  'pdcch-five-2cce',
  'pdsch-full-qpsk',
] as const satisfies readonly FixedRequirementId[]);
const GOLD_REQUIREMENTS = Object.freeze([
  'crs-port0',
  'pbch-zero-input',
  'pcfich-cfi1',
  'phich-zero-hi',
  'pdcch-five-2cce',
  'pdsch-full-qpsk',
] as const satisfies readonly FixedRequirementId[]);
const SINGLE_PORT_IDENTITY_REQUIREMENTS = Object.freeze([
  'pbch-zero-input',
  'pcfich-cfi1',
  'phich-zero-hi',
  'pdcch-five-2cce',
  'pdsch-full-qpsk',
] as const satisfies readonly FixedRequirementId[]);

export const LTE_ETM1_1_TEST_SOURCE_SHA256 = Object.freeze({
  'src/lte-etm1-reference.test.ts':
    'bb923358cab98cff42736847d7b1ddb179dfe1a24403fc65fa8ba9a9081c2d11',
  'src/lte-etm1-provider.test.ts':
    'bf6d9745383be9543cdb7093df004375e38dcfacbc1ee5e4cf8a386bb75d4f3f',
  'src/lte-etm1-independent-oracle.test.ts':
    '8683e2564871bab61669f4e23f8935710a7e01940856ea775ec03eb61193a0a8',
} as const);

function assertionContract(
  input: Omit<
    LteEtm11SemanticAssertionContract,
    'schemaVersion' | 'sourceFileSha256'
  >,
): LteEtm11SemanticAssertionContract {
  const sourceFile = input.sourceLocation.split('#', 1)[0]!;
  const sourceFileSha256 =
    LTE_ETM1_1_TEST_SOURCE_SHA256[
      sourceFile as keyof typeof LTE_ETM1_1_TEST_SOURCE_SHA256
    ];
  if (sourceFileSha256 === undefined) {
    throw new Error(`No pinned test-source digest exists for ${sourceFile}`);
  }
  return deepFreeze({ schemaVersion: 1, ...input, sourceFileSha256 });
}

/**
 * Each assertionSha256 in the production catalog is SHA-256 over the canonical
 * JSON bytes of one of these complete semantic contracts. It does not hash a
 * test name alone and is intentionally mutation-sensitive to preconditions,
 * assertions, method, source location, coverage, and executor identity.
 */
export const LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS = Object.freeze([
  assertionContract({
    testId: 'lte.etm1.reference.profile-binding',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#is fail-closed to the fixed TS 36.141 profile and does not claim qualification',
    method: 'automated-unit',
    preconditions: ['Load fixed profile lte-etm1.1-10mhz-fdd-release19-candidate.'],
    assertions: [
      'Bind 10 MHz to 50 RB, PCI 1, FDD, normal CP, 15 kHz, one 10 ms frame, one layer on port 0 with identity processing, CFI 1, fixed PHICH/PDCCH/PDSCH parameters, and declared relative EPRE.',
      'Require all nine implementation-ledger rows while retaining complianceClaimed=false and independentVerification=not-performed.',
    ],
    coversFixedRequirementIds: ALL_FIXED_REQUIREMENTS,
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.gold-vectors',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#matches independently frozen Gold-sequence bits and rejects invalid seeds or lengths',
    method: 'automated-unit',
    preconditions: ['Invoke the Release-19 length-31 Gold-sequence helper with frozen valid and invalid inputs.'],
    assertions: [
      'Match 64 frozen output bits for c_init values 0, 1, and 4609.',
      'Reject negative, non-integral, and out-of-range inputs.',
    ],
    coversFixedRequirementIds: GOLD_REQUIREMENTS,
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.single-port-identity',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#applies the one-layer single-port identity stage without changing any channel symbol',
    method: 'automated-unit',
    preconditions: [
      'Invoke the explicit Release-19 one-layer/single-antenna-port identity stage with finite complex channel symbols and invalid non-finite symbols.',
    ],
    assertions: [
      'Preserve every real and imaginary component exactly, including signed zero, while returning frozen non-aliased output.',
      'Reject NaN and infinite channel symbols before resource-element mapping.',
    ],
    coversFixedRequirementIds: SINGLE_PORT_IDENTITY_REQUIREMENTS,
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.sync-vectors',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#matches known PCI=1 PSS and SSS sequence elements',
    method: 'automated-unit',
    preconditions: ['Generate PCI 1 FDD PSS and SSS for subframes 0 and 5.'],
    assertions: [
      'Match frozen PSS complex elements and unit magnitudes.',
      'Match all 62 frozen SSS signs for each synchronization subframe and reject invalid inputs.',
    ],
    coversFixedRequirementIds: ['pss-sss'],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.grid-counts',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#constructs one complete 50-RB resource grid with exact channel and reservation counts',
    method: 'automated-property',
    preconditions: ['Generate the complete fixed E-TM1.1 frame.'],
    assertions: [
      'Require a 140 by 600 resource grid and exactly 84000 classified resource elements.',
      'Require frozen per-channel counts for CRS, PSS, SSS, PBCH, PCFICH, PHICH, PDCCH, PDSCH, and reservations.',
    ],
    coversFixedRequirementIds: ['frame-grid', ...CHANNEL_REQUIREMENTS],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.grid-mapping',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#places CRS, synchronization signals, PBCH, and first-symbol control REGs at known coordinates',
    method: 'automated-property',
    preconditions: ['Generate the complete fixed E-TM1.1 resource grid.'],
    assertions: [
      'Match frozen coordinates and complex values for CRS, PSS, SSS, PBCH, PCFICH, PHICH, PDCCH, and PDSCH.',
      'Require four PCFICH REGs, six PHICH REGs, ninety PDCCH REGs, and the expected PBCH reservations.',
    ],
    coversFixedRequirementIds: ['frame-grid', ...CHANNEL_REQUIREMENTS],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.ofdm-frame',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#renders exactly 153600 finite samples with exact normal-CP copies and declared fixed scaling',
    method: 'automated-property',
    preconditions: ['Render the fixed resource grid using the declared 1024-point inverse DFT convention.'],
    assertions: [
      'Require 153600 finite complex samples and 140 cyclic prefixes with exact 80/72-sample copies.',
      'Require Parseval-consistent 1/1024 scaling and no clipping or adaptive normalization.',
    ],
    coversFixedRequirementIds: ['frame-grid', 'ofdm-rendering'],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.reference.epre-and-dc',
    sourceLocation:
      'src/lte-etm1-reference.test.ts#maps the split resource grid around an empty DC bin and preserves all E-TM relative EPRE values',
    method: 'automated-property',
    preconditions: ['Transform the first rendered OFDM symbol back to the frequency domain.'],
    assertions: [
      'Require the split 600-subcarrier grid around an empty DC bin.',
      'Require declared relative EPRE for synchronization, PBCH, PCFICH, PHICH, PDCCH, and PDSCH resource elements.',
    ],
    coversFixedRequirementIds: [...CHANNEL_REQUIREMENTS, 'ofdm-rendering'],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.provider.profile-binding',
    sourceLocation:
      'src/lte-etm1-provider.test.ts#binds the entire revision-2.0.0 preset configuration and fixed recipe identity',
    method: 'automated-integration',
    preconditions: ['Construct the only generation request accepted by the fixed LTE provider.'],
    assertions: [
      'Bind preset revision 2.0.0, recipe revision 1.0.1, all fixed configuration parameters including transmission.layers=1 and transmission.precoding=false, and configuration SHA-256 60e4b8ab807a79952863f556f8580e723dbf93bf951203822908e02e7719bb18.',
      'Permit reference-generated qualification only.',
    ],
    coversFixedRequirementIds: ALL_FIXED_REQUIREMENTS,
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.provider.exact-cf64le',
    sourceLocation:
      'src/lte-etm1-provider.test.ts#encodes one port as deterministic little-endian interleaved Float64 IQ',
    method: 'automated-integration',
    preconditions: ['Generate the fixed reference frame twice through the artifact provider.'],
    assertions: [
      'Require 153600 one-port channel-major interleaved Float64 IQ samples at 15.36 Msample/s and exactly 2457600 bytes.',
      'Require deterministic content SHA-256 1cb66b49be2518ea33a2bbf1f7075b54e6e62e10a9c05491a0ba4727bfe05511 and exact little-endian sample encoding.',
    ],
    coversFixedRequirementIds: ['frame-grid', 'ofdm-rendering'],
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.provider.content-admission',
    sourceLocation:
      'src/lte-etm1-provider.test.ts#admits and replays the exact content-addressed artifact with no transformations',
    method: 'automated-integration',
    preconditions: ['Generate and admit the fixed artifact through the standards provider boundary.'],
    assertions: [
      'Bind manifest, configuration, and artifact SHA-256 identities before replay.',
      'Require no filtering, normalization, resampling, scaling, or sample transformation and retain complianceClaim=not-claimed.',
    ],
    coversFixedRequirementIds: ALL_FIXED_REQUIREMENTS,
    implementation: {
      providerId: TEST_PROVIDER_ID,
      implementationId: TEST_IMPLEMENTATION_ID,
    },
  }),
  assertionContract({
    testId: 'lte.etm1.oracle.full-frame',
    sourceLocation:
      'src/lte-etm1-independent-oracle.test.ts#matches every resource element and OFDM sample from the pinned independent implementation',
    method: 'independent-oracle',
    preconditions: [
      'Require pinned external srsRAN grid and time-domain vectors; absence must not produce a passing execution.',
      'Bind srsRAN commit 6bcbd9e5bf8686aa7085202cd847c5ddd64a9c16, build patch SHA-256 284e1453cc0ea4fed616a7a88e5fa65d706de698a6c0395ec575772d663d1173, harness source SHA-256 0742db2648c909f93e8e15719baf9d1c9ccb0c3f30d2444a86332f8a4ec3ece9, and harness binary SHA-256 e0306c21b925d76fa33a55d7e08759679c1560a28f723b9c2d5c9d6fdbbd597f.',
    ],
    assertions: [
      'Execute the pinned harness binary into fresh files and require its grid/time bytes to match the pinned cached vectors and SHA-256 identities.',
      'Match every one of 84000 complex resource elements against fresh grid SHA-256 8be0dd55e7f8104f720876696e9b65d3c6d1bcdc480ac54e235e90ee8da99413 within declared component tolerances.',
      'Match every one of 153600 complex OFDM samples against fresh time SHA-256 6e7ce0f4070c8f61cdc53c688064d673e62762833828c7243bc2261ff5d3f3e9 within declared component tolerance.',
    ],
    coversFixedRequirementIds: ALL_FIXED_REQUIREMENTS,
    implementation: {
      providerId: ORACLE_PROVIDER_ID,
      implementationId: ORACLE_IMPLEMENTATION_ID,
    },
  }),
] as const satisfies readonly LteEtm11SemanticAssertionContract[]);

function canonicalJson(value: unknown): string {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value}`);
}

export function canonicalLteEtm11AssertionContractJson(
  contract: LteEtm11SemanticAssertionContract,
): string {
  return canonicalJson(contract);
}

export function lteEtm11AssertionSha256(
  contract: LteEtm11SemanticAssertionContract,
): string {
  return sha256HexOfBytes(canonicalLteEtm11AssertionContractJson(contract));
}

/**
 * Revision-1.3.0 pins derived from the canonical contracts above.
 *
 * These are regression locks, not hand-selected stand-ins: each value must
 * equal lteEtm11AssertionSha256(contract). A semantic edit therefore requires
 * an intentional catalog-revision and pin update.
 */
export const LTE_ETM1_1_ASSERTION_SHA256_PINS: Readonly<Record<string, string>> = Object.freeze({
  'lte.etm1.reference.profile-binding':
    '236d9713bcf37242c3430517fa7ef70a3543385e432fe407869e26b53f99ed75',
  'lte.etm1.reference.gold-vectors':
    'b7108c9c22d1fd1897d4a4bc7bfa5b9893eb9075c7ea85bb3720914626a110ff',
  'lte.etm1.reference.single-port-identity':
    '3e5655ea7c1340253c7a114df44e117800a1ff25263e5844f9713c4a0aabc109',
  'lte.etm1.reference.sync-vectors':
    '3c397ca32aff578181adcb1b34e63e5b2a50a111df060d935b6e12b9ae579dd6',
  'lte.etm1.reference.grid-counts':
    'c1de418778652da3fec8055a096dce4abc444552bfd1a7a9c1820303d3319383',
  'lte.etm1.reference.grid-mapping':
    '7d9393a7e1153cccc73aef9b837980ed34aabc5a38d7b8855c2c1de9f7cb5bb3',
  'lte.etm1.reference.ofdm-frame':
    'af81d28ba83f808d200b7528fbb0fe40586d87545d7c198c243c2d20ad1deaff',
  'lte.etm1.reference.epre-and-dc':
    '78de85339cf8959a579dcfc70bbfcb2e69d5e096efbd9b9517ec26993f02c7b7',
  'lte.etm1.provider.profile-binding':
    '1bf8d0fe146d21f3c9858cb4e5ea6b2d1116fe29408ef0d59dd7ea48d19d7dde',
  'lte.etm1.provider.exact-cf64le':
    'ee59310aea8617ac0b112fe5bd84f44af99543b67848caf982ac349a3b29033a',
  'lte.etm1.provider.content-admission':
    '0c939ae4ca45008e2f10185245c5eee06738c0ec2d062933ffe597793b994617',
  'lte.etm1.oracle.full-frame':
    'c2eafe8b525e90fd9cfecb0cad6f6f3efaa3add2c63bff37de38face4c6ef6c0',
});

const assertionPinMismatches: string[] = [];
for (const contract of LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS) {
  const observedAssertionSha256 = lteEtm11AssertionSha256(contract);
  if (observedAssertionSha256 !== LTE_ETM1_1_ASSERTION_SHA256_PINS[contract.testId]) {
    assertionPinMismatches.push(`${contract.testId}=${observedAssertionSha256}`);
  }
}
if (assertionPinMismatches.length > 0) {
  throw new Error(
    `Semantic assertions changed without a catalog revision and digest-pin update: ${assertionPinMismatches.join(', ')}`,
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function requirementId(
  fixedRequirementId: FixedRequirementId,
  descriptor: LteEtm11ClauseDescriptor,
): string {
  const document = descriptor.documentId.toLowerCase().replace(/\s+/g, '');
  return `lte.etm1.${fixedRequirementId}.${document}.c${descriptor.clause}`;
}

function verifiedEvidenceByClause(
  evidence: readonly VerifiedLteEtm11ClauseDigest[],
): Map<LteEtm11ClauseKey, VerifiedLteEtm11ClauseDigest> {
  const byClause = new Map<LteEtm11ClauseKey, VerifiedLteEtm11ClauseDigest>();
  for (const item of evidence) {
    if (
      typeof item !== 'object'
      || item === null
      || item[verifiedClauseDigestBrand] !== true
    ) {
      throw new TypeError(
        'Catalog clause evidence must be reproduced against the pins or loaded from the retained report',
      );
    }
    // Read every caller-controlled property exactly once before validation.
    // This prevents a branded Proxy from changing values between lookup,
    // comparison, and construction.
    const observedClauseKey = item.clauseKey;
    const observedSourceArchiveSha256 = item.sourceArchiveSha256;
    const observedNormativeTextSha256 = item.normativeTextSha256;
    const observedNormativeTextByteLength = item.normativeTextByteLength;
    const observedExtractionReportSha256 = item.extractionReportSha256;
    const descriptor = CLAUSES_BY_KEY.get(observedClauseKey);
    const pin = LTE_ETM1_1_NORMATIVE_RANGE_PINS[observedClauseKey];
    if (
      descriptor === undefined
      || pin === undefined
      || observedSourceArchiveSha256 !== descriptor.sourceArchiveSha256
      || observedNormativeTextSha256 !== pin.sha256
      || observedNormativeTextByteLength !== pin.byteLength
      || observedExtractionReportSha256 !== LTE_ETM1_1_CLAUSE_EVIDENCE_REPORT_SHA256
    ) {
      throw new TypeError(
        `Catalog clause evidence does not match the pinned normative evidence for ${String(observedClauseKey)}`,
      );
    }
    if (byClause.has(descriptor.clauseKey)) {
      throw new TypeError(`Duplicate normative evidence for ${descriptor.clauseKey}`);
    }
    // Store a new immutable snapshot built only from compiled descriptors and
    // pins, so a branded proxy or subsequently mutated caller object cannot
    // change the catalog after ingress validation.
    byClause.set(descriptor.clauseKey, createVerifiedClauseDigest(descriptor, pin));
  }
  const expectedKeys = new Set(LTE_ETM1_1_REQUIRED_CLAUSES.map((item) => item.clauseKey));
  const missing = [...expectedKeys].filter((key) => !byClause.has(key));
  const extra = [...byClause.keys()].filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new TypeError(
      `Clause evidence must exactly cover the fixed profile; missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`,
    );
  }
  return byClause;
}

/**
 * Constructs the production clause-to-test catalog only after every exact
 * clause range has content-verified, pinned normative evidence.
 *
 * This function creates definitions, never test executions. In particular it
 * cannot turn the optional independent-oracle Vitest lane into evidence when
 * its pinned vectors were unavailable and the test was skipped.
 */
export function createLteEtm11ClauseTestCatalog(
  clauseEvidence: readonly VerifiedLteEtm11ClauseDigest[],
): StandardsTestCatalog {
  const evidenceByClause = verifiedEvidenceByClause(clauseEvidence);
  const obligationRows = FIXED_REQUIREMENTS.flatMap((fixedRequirement) =>
    fixedRequirement.clauseKeys.map((clauseKey) => {
      const descriptor = CLAUSES_BY_KEY.get(clauseKey);
      const evidence = evidenceByClause.get(clauseKey);
      if (descriptor === undefined || evidence === undefined) {
        throw new TypeError(`Internal clause map is incomplete for ${clauseKey}`);
      }
      return {
        fixedRequirementId: fixedRequirement.fixedRequirementId,
        requirementId: requirementId(fixedRequirement.fixedRequirementId, descriptor),
        title: `${fixedRequirement.title} — ${descriptor.documentId} clause ${descriptor.clause}`,
        applicabilityRationale: fixedRequirement.applicabilityRationale,
        descriptor,
        evidence,
      };
    }));

  const testIdsByFixedRequirement = new Map<FixedRequirementId, string[]>(
    FIXED_REQUIREMENTS.map((requirement) => [requirement.fixedRequirementId, []]),
  );
  for (const contract of LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS) {
    for (const fixedRequirementId of contract.coversFixedRequirementIds) {
      testIdsByFixedRequirement.get(fixedRequirementId)!.push(contract.testId);
    }
  }

  const requirements = obligationRows.map((row) => ({
    requirementId: row.requirementId,
    title: row.title,
    clause: {
      organization: '3GPP' as const,
      documentId: row.descriptor.documentId,
      revision: row.descriptor.revision,
      release: row.descriptor.release,
      clause: row.descriptor.clause,
      normativeTextSha256: row.evidence.normativeTextSha256,
    },
    scope: 'digital-baseband' as const,
    applicability: 'applicable' as const,
    applicabilityRationale: row.applicabilityRationale,
    disposition: 'implemented' as const,
    testIds: testIdsByFixedRequirement.get(row.fixedRequirementId)!,
  }));

  const tests = LTE_ETM1_1_SEMANTIC_ASSERTION_CONTRACTS.map((contract) => ({
    testId: contract.testId,
    title: contract.assertions.join(' '),
    method: contract.method,
    sourceLocation: contract.sourceLocation,
    sourceFileSha256: contract.sourceFileSha256,
    assertionSha256: lteEtm11AssertionSha256(contract),
    coversRequirementIds: obligationRows
      .filter((row) => contract.coversFixedRequirementIds.includes(row.fixedRequirementId))
      .map((row) => row.requirementId),
    implementation: contract.implementation,
  }));

  return standardsTestCatalogSchema.parse({
    schemaVersion: 1,
    catalogId: LTE_ETM1_1_CATALOG_ID,
    revision: LTE_ETM1_1_CATALOG_REVISION,
    subject: {
      presetId: PRESET_ID,
      presetRevision: PRESET_REVISION,
      generatorProviderId: GENERATOR_PROVIDER_ID,
      generatorImplementationId: GENERATOR_IMPLEMENTATION_ID,
    },
    requirements,
    tests,
  });
}

export interface LteEtm11RequiredExecutionBinding {
  readonly testId: string;
  readonly assertionSha256: string;
  readonly subjectArtifactSha256: string;
  readonly executor: {
    readonly providerId: string;
    readonly implementationId: string;
  };
}

/**
 * Produces only the immutable identities a runner must bind. It deliberately
 * omits outcome, executedAt, reportSha256, and runner metadata, so the result
 * cannot be mistaken for a passing test execution.
 */
export function lteEtm11RequiredExecutionBindings(
  catalog: StandardsTestCatalog,
  subjectArtifactSha256: string,
): readonly LteEtm11RequiredExecutionBinding[] {
  const parsedCatalog = standardsTestCatalogSchema.parse(catalog);
  if (
    parsedCatalog.catalogId !== LTE_ETM1_1_CATALOG_ID
    || parsedCatalog.revision !== LTE_ETM1_1_CATALOG_REVISION
  ) {
    throw new TypeError('Execution bindings require the fixed LTE E-TM1.1 catalog revision');
  }
  assertNonPlaceholderDigest(subjectArtifactSha256, 'Subject-artifact digest');
  return Object.freeze(parsedCatalog.tests.map((definition) => deepFreeze({
    testId: definition.testId,
    assertionSha256: definition.assertionSha256,
    subjectArtifactSha256,
    executor: definition.implementation,
  })));
}

export interface LteEtm11CampaignEnvelopeInput {
  readonly catalog: StandardsTestCatalog;
  readonly subjectArtifactSha256: string;
  readonly evaluatedAt: string;
  readonly executions: readonly StandardsTestExecution[];
}

/**
 * Content-binds caller-provided executions to a catalog and artifact.
 *
 * evaluatedAt is mandatory because the admission gate measures every execution
 * against that instant and rejects results older than 24 hours or in the
 * future. This helper computes only the catalog digest; it never creates,
 * upgrades, or defaults an execution to `pass`.
 */
export function createLteEtm11CampaignEnvelope(
  input: LteEtm11CampaignEnvelopeInput,
): StandardsTestCampaign {
  const catalog = standardsTestCatalogSchema.parse(input.catalog);
  if (
    catalog.catalogId !== LTE_ETM1_1_CATALOG_ID
    || catalog.revision !== LTE_ETM1_1_CATALOG_REVISION
  ) {
    throw new TypeError('Campaign envelope requires the fixed LTE E-TM1.1 catalog revision');
  }
  return standardsTestCampaignSchema.parse({
    catalog,
    catalogSha256: standardsTestCatalogSha256(catalog),
    subjectArtifactSha256: input.subjectArtifactSha256,
    evaluatedAt: input.evaluatedAt,
    executions: input.executions,
  });
}
