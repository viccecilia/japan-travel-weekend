ssh -tt -i "$env:USERPROFILE\.ssh\tourflow_sakura_vps_ed25519" ubuntu@133.167.79.170 "bash -lc 'bash /tmp/deploy-phase41-test-api.sh'"
Read-Host 'Restart verification finished. Press Enter to close'
