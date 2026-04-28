import anthropic 
import os 
from dotenv import load_dotenv 
 
# Load your .env file so the API key is available 
load_dotenv() 
 
# Create the Anthropic client 
client = anthropic.Anthropic(api_key=os.getenv("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")) 
 
# Make your first API call 
message = client.messages.create( 
    model="claude-sonnet-4-5", 
    max_tokens=1024, 
    messages=[ 
        { 
            "role": "user", 
            "content": "I want to build a food delivery app for college students. What are 3 important questions a Business Analyst would ask?" 
        } 
    ] 
) 
 
# Print the response 
print(message.content[0].text)