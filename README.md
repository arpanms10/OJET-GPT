# OJET-GPT

AI Assistant to help to write code using Oracle JET and Redwood

## Introduction

OJET-GPT is an AI Assistant to help developers write code using Oracle JET and Redwood. It is based on Deepseek Coder V2 model. It can generate code snippets, provide code suggestions, and answer questions related to Oracle JET and Redwood.

## LLM details

Model: Deepseek Coder V2
Model size: 8.9GB
Number of parameters: 15.7B
Training data: Stack Overflow, GitHub, Oracle JET documentation, Redwood documentation

### How to run the model

Download & install Ollama in your system
https://ollama.com/download

Ollama pull deepseek-coder-v2
Ollama run deepseek-coder-v2
Listen to localhost:11434

## Database

PostgreSQL 14.0
Planning to use pgVector for vector search and embeddings

## API

NodeJs API to interact with the model and database. Basic Html file to input prompt and get response from the model. Response will be displayed in the browser as a stream of data.
