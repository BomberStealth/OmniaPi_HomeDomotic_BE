#!/bin/bash

# ============================================
# OMNIAPI HOME DOMOTIC - STOP APPLICATION
# ============================================

echo "🛑 Arresto OmniaPi Home Domotic..."

pm2 stop all

echo "✅ Applicazione arrestata!"
