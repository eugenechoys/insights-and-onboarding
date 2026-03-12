#!/bin/bash
# Generate env.js from Vercel environment variables
cat > env.js << EOF
window.__ENV__ = {
  OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
};
EOF
