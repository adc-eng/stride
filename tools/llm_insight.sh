#!/bin/bash

# Load and export all variables from the secrets file
if [ -f .secrets.txt ]; then
    export $(echo $(grep -v '^#' .secrets.txt | xargs))
else
    echo "Error: .secrets.txt file not found"
fi

echo "Proceeding with $ANTHROPIC_API_KEY"
echo "Press any key to continue"
read junk

echo "[Edit the script and remove the gate first].."
exit

curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d @payload.json -o response.json
