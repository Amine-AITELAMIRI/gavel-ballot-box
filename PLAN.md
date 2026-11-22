# Gavel

Build the selected Ballot Box design. A visitor tries one sample lot with one server-seeded rival, enters an amount, seals it, and closes their own room. A signed-in organizer can create an auction, add lots and share a link. A signed-in bidder can only raise their own bid before close.

The four domain entities are auctions, lots, bids and results. Only publish the winner, amount and count. Resolve close, bid validation and winner selection in one storage transaction. Server time controls the deadline. Tie goes to the earliest accepted bid at the tied amount.

Keep optional lot research, placeholder art and winner notifications off the sample path. No payments, attachments, chat or withdrawal. A losing bid appearing in another browser's response is a release blocker.
