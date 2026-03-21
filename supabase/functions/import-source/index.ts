import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub;

    const { url, item_id, source_id } = await req.json();

    if (!url || !item_id) {
      return new Response(
        JSON.stringify({ error: "url and item_id are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Determine source type
    let sourceType = 'website';
    if (/docs\.google\.com|drive\.google\.com/.test(formattedUrl)) {
      sourceType = 'google_doc';
    } else if (/notion\.so/.test(formattedUrl)) {
      sourceType = 'notion';
    } else if (/youtube\.com|youtu\.be/.test(formattedUrl)) {
      sourceType = 'youtube';
    } else if (/\.pdf($|\?)/.test(formattedUrl)) {
      sourceType = 'pdf';
    }

    // Extract external ID for Google Docs
    let externalId: string | null = null;
    if (sourceType === 'google_doc') {
      const match = formattedUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) externalId = match[1];
    }

    // Create or update source record as "importing"
    let sourceRecord: string;
    if (source_id) {
      await supabase
        .from('archive_sources')
        .update({ status: 'importing' })
        .eq('id', source_id)
        .eq('user_id', userId);
      sourceRecord = source_id;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('archive_sources')
        .insert({
          user_id: userId,
          item_id,
          source_type: sourceType,
          source_url: formattedUrl,
          external_id: externalId,
          status: 'importing',
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create source record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      sourceRecord = insertData.id;
    }

    // Scrape using Firecrawl
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      await supabase
        .from('archive_sources')
        .update({ status: 'failed' })
        .eq('id', sourceRecord);
      
      return new Response(
        JSON.stringify({ error: 'Scraping service not configured', source_id: sourceRecord }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping ${sourceType}: ${formattedUrl}`);

    // For Google Docs, try the published/export URL first for better results
    let scrapeUrl = formattedUrl;
    if (sourceType === 'google_doc' && externalId) {
      // Use export URL for cleaner text extraction
      scrapeUrl = `https://docs.google.com/document/d/${externalId}/export?format=txt`;
    }

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: scrapeUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      // If Google Doc export failed, try the original URL
      if (sourceType === 'google_doc' && scrapeUrl !== formattedUrl) {
        console.log('Export URL failed, trying original URL...');
        const retryResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: formattedUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        const retryData = await retryResponse.json();
        if (retryResponse.ok && retryData.success) {
          const text = retryData.data?.markdown || retryData.data?.content || '';
          const title = retryData.data?.metadata?.title || '';

          await supabase
            .from('archive_sources')
            .update({
              title: title.slice(0, 500),
              imported_text: text.slice(0, 50000), // Cap at 50K chars
              status: 'ready',
              imported_at: new Date().toISOString(),
            })
            .eq('id', sourceRecord);

          return new Response(
            JSON.stringify({ success: true, source_id: sourceRecord, title, text_length: text.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      console.error('Scrape failed:', scrapeData);
      await supabase
        .from('archive_sources')
        .update({ status: 'failed' })
        .eq('id', sourceRecord);

      return new Response(
        JSON.stringify({ error: 'Failed to import content', source_id: sourceRecord }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success — extract content
    const importedText = scrapeData.data?.markdown || scrapeData.data?.content || '';
    const title = scrapeData.data?.metadata?.title || '';

    await supabase
      .from('archive_sources')
      .update({
        title: title.slice(0, 500),
        imported_text: importedText.slice(0, 50000),
        status: 'ready',
        imported_at: new Date().toISOString(),
      })
      .eq('id', sourceRecord);

    console.log(`Import successful: ${title} (${importedText.length} chars)`);

    return new Response(
      JSON.stringify({ success: true, source_id: sourceRecord, title, text_length: importedText.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import source error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
