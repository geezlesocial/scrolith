FROM clamav/clamav:1.4.3

# The upstream image defaults to a Unix socket. Scrolith connects over the
# private Container Apps TCP ingress, so provide an explicit TCP listener.
USER root
RUN cp /etc/clamav/clamd.conf /etc/clamav/clamd-tcp.conf \
    && printf '\nTCPSocket 3310\nTCPAddr 0.0.0.0\n' >> /etc/clamav/clamd-tcp.conf

USER clamav
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["freshclam --stdout || true; exec clamd --foreground --config-file=/etc/clamav/clamd-tcp.conf"]
