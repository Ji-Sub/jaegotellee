import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
    const { request, env } = context;

    // 1. Secret check for authorization
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');
    if (secret !== env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // 2. Setup Supabase Client
        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase Environment Variables');
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 3. Get '핫딜 모음' category ID
        const { data: catData } = await supabase.from('categories').select('id').eq('name', '핫딜 모음').single();
        if (!catData) throw new Error("Category '핫딜 모음' not found.");
        const hotdealCategoryId = catData.id;

        // 4. Fetch the target feed
        const targetUrl = 'https://hotdeal.zip/api/deals.php?page=1&category=all';
        const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://hotdeal.zip/',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        const response = await fetch(targetUrl, { headers: fetchHeaders });

        const feedJson = await response.json();
        if (!feedJson || !feedJson.success || !feedJson.data) {
            throw new Error('Failed to parse hotdeal feed');
        }

        const items = feedJson.data;
        let addedCount = 0;

        // 5. Build Deduplication list
        // Get latest ~100 external links from DB to quickly skip
        const { data: existingPosts } = await supabase
            .from('posts')
            .select('external_link')
            .order('created_at', { ascending: false })
            .limit(100);

        const existingLinks = new Set((existingPosts || []).map(p => p.external_link));

        // 6. Process each item
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        for (const item of items) {
            const itemUrl = `https://hotdeal.zip/${item.url}`;

            // Add an artificial random delay (1~3 seconds) to mimic human browsing behavior
            const randomDelay = Math.floor(Math.random() * 2000) + 1000;
            await delay(randomDelay);

            // A. Extract Real URL & Thumbnail from item page via string parsing
            const detailRes = await fetch(itemUrl, { headers: fetchHeaders });
            const htmlText = await detailRes.text();

            // Extract Content HTML
            let contentHtml = '';
            const contentMatch = htmlText.match(/<content>([\s\S]*?)<\/content>/i);
            if (contentMatch) {
                contentHtml = contentMatch[1];
            }

            // Extract Original Link
            let externalLink = itemUrl; // fallback
            const linkMatch = htmlText.match(/<link>(.*?)<\/link>/i);
            if (linkMatch && linkMatch[1]) {
                externalLink = linkMatch[1].trim();
            }

            // Skip if duplicated
            if (existingLinks.has(externalLink)) {
                continue;
            }

            // Extract Thumbnail
            let imageUrl = null;
            let imgMatch = contentHtml.match(/<img[^>]+src=["'](.*?)["']/i);
            if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1];
                if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                else if (imageUrl.startsWith('/')) imageUrl = 'https://hotdeal.zip' + imageUrl;
            }

            // Fallback description
            let plainTextDesc = contentHtml.replace(/<[^>]+>/g, '').trim().substring(0, 150);

            const price = item.price || '';

            // Validate title and externalLink
            if (item.title && externalLink) {
                // Double check against DB (in case two workers ran)
                const { data: duplicateCheck } = await supabase
                    .from('posts')
                    .select('id')
                    .eq('external_link', externalLink)
                    .maybeSingle();

                if (!duplicateCheck) {
                    // B. Insert into Supabase
                    const { error: insertError } = await supabase.from('posts').insert([{
                        title: item.title,
                        description: plainTextDesc,
                        price: price,
                        image_url: imageUrl,
                        external_link: externalLink,
                        content_html: contentHtml,
                        category: hotdealCategoryId,
                        approved: true,
                        is_hot: true,
                        views: 0,
                        like_count: 0
                    }]);

                    if (insertError) {
                        console.error('Insert error for', item.title, insertError);
                    } else {
                        addedCount++;
                    }
                }
            }
        }

        return new Response(JSON.stringify({ success: true, added: addedCount }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Scraping Error:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
