ssh -tt -i "$env:USERPROFILE\.ssh\tourflow_sakura_vps_ed25519" ubuntu@133.167.79.170 "bash -lc 'bash /home/ubuntu/jtw-test-deploy-jtw-20260906-website-i18n-v10/install.sh'"
Read-Host "Deployment finished. Press Enter to close"
