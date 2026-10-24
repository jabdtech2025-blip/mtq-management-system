/**
 * Quran.com API v4 Service
 * Fetches page-by-page word-by-word Uthmanic data for digital Mushaf rendering.
 */

export interface QuranWord {
  id: number;
  position: number;
  audioUrl?: string;
  charTypeName: 'word' | 'end';
  textUthmani: string;
  codeV1?: string;
  pageNumber: number;
  lineNumber: number;
  location: string; // e.g. "19:1:1"
}

export interface QuranVerse {
  id: number;
  verseNumber: number;
  verseKey: string; // e.g. "19:1"
  juzNumber: number;
  hizbNumber: number;
  rubNumber: number;
  pageNumber: number;
  words: QuranWord[];
}

export interface QuranPageResponse {
  pageNumber: number;
  totalVerses: number;
  verses: QuranVerse[];
}

/**
 * Robust async function to retrieve verses and word-by-word Uthmanic text
 * from Quran.com API v4 for a specific page (1-604).
 *
 * @param pageNumber - The page number in the Mushaf (1 to 604)
 * @returns Clean, structured page data object ready for UI rendering and canvas annotation overlay
 */
export async function fetchMushafPage(pageNumber: number): Promise<QuranPageResponse> {
  // 1. Parameter Validation
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    throw new RangeError(
      `Invalid pageNumber: ${pageNumber}. Mushaf page numbers must be an integer between 1 and 604.`
    );
  }

  // 2. Build Quran.com API v4 URL
  const baseUrl = 'https://api.quran.com/api/v4/verses/by_page';
  const queryParams = new URLSearchParams({
    words: 'true',
    word_fields: 'text_uthmani,location,code_v1,line_number,v1_page',
    per_page: '50' // Guarantees all verses for any single page are fetched in one request
  });

  const endpoint = `${baseUrl}/${pageNumber}?${queryParams.toString()}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(
        `Quran.com API Error: ${response.status} ${response.statusText} for page ${pageNumber}`
      );
    }

    const rawData = await response.json();

    if (!rawData || !Array.isArray(rawData.verses)) {
      throw new Error('Malformed response from Quran.com API: missing verses array.');
    }

    // 3. Transform and Sanitize into a Clean UI-Ready Structure
    const sanitizedVerses: QuranVerse[] = rawData.verses.map((verse: any) => ({
      id: verse.id,
      verseNumber: verse.verse_number,
      verseKey: verse.verse_key,
      juzNumber: verse.juz_number,
      hizbNumber: verse.hizb_number,
      rubNumber: verse.rub_el_hizb_number,
      pageNumber: verse.page_number,
      words: Array.isArray(verse.words)
        ? verse.words.map((word: any) => ({
            id: word.id,
            position: word.position,
            charTypeName: word.char_type_name,
            textUthmani: word.text_uthmani || word.text,
            codeV1: word.code_v1,
            pageNumber: word.v1_page || word.page_number || pageNumber,
            lineNumber: word.line_number,
            location: word.location
          }))
        : []
    }));

    return {
      pageNumber,
      totalVerses: sanitizedVerses.length,
      verses: sanitizedVerses
    };
  } catch (error) {
    console.error(`[fetchMushafPage] Failed to retrieve page ${pageNumber}:`, error);
    throw error;
  }
}
