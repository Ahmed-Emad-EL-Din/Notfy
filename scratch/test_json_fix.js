const sanitizeJson = (input) => {
    console.log("Input sample:", input.substring(0, 10) + "...");
    
    // Strategy: Find the first { and last } to strip BOM or noise
    let cleaned = input.trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    
    // Handle literal \n and real newlines in the private_key specifically
    // Sometimes the whole JSON is multiline, which JSON.parse hates unless they are inside strings.
    // If we have actual newlines outside of the key, it's fine for JSON.parse?
    // Actually JSON.parse(multiline_json) is fine in Node, but ONLY if they aren't inside the string values.
    
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn("First fallback failed, cleaning whitespace and escapes...");
        // Strip physical newlines (common in env vars) but keep escaped \n
        // This is tricky. Let's try to remove physical newlines that are NOT part of a string.
        // Or simply remove all newlines and assume the content has literal \n
        const stage2 = cleaned.replace(/\r?\n|\r/g, " ");
        return JSON.parse(stage2);
    }
};

const badInput = `
 { 
  "type": "service_account",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nABC\\nDEF\\n-----END PRIVATE KEY-----\\n"
 }
`;

try {
    const result = sanitizeJson(badInput);
    console.log("Success! Project ID:", result.project_id || "not found but parsed");
} catch (err) {
    console.error("All strategies failed:", err.message);
}
